"""Does the fight predictor get better if recent fights count more? (``uv run python -m
ufc_embedded.recency``)

MMA changes over time: output has doubled since the early 2000s, and clinch and ground
striking have fallen to about a quarter. The deployed win model counts every fight before
2024 the same. This tries, on the same rolling validation as ``train.py`` (each year
2019-23 predicted from all earlier years), two ways of favouring recent fights:

- **Recency weights**: a fight ``h`` years before the year being predicted counts half.
- **A training window**: only the last ``N`` years are used.

Each variant gets its own regularisation strength (the best of ``LR_CS`` on mean rolling
log loss, as ``train.py`` does), and its gain over the baseline comes with a paired
bootstrap 95% interval over fights, since gains this small can be noise.

It also fits the model on sliding 4-year windows to show how much each feature's weight
moves between eras. Only fights before 2024 are used for anything with results in it: the
2024+ test set stays locked. Plots go to ``docs/experiments/`` and, with ``--wandb``, to
Weights & Biases.
"""

import argparse
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402

from ufc_embedded.data import load_raw  # noqa: E402
from ufc_embedded.evaluate import CV_YEARS, TEST_START, calibration_table, metrics  # noqa: E402
from ufc_embedded.style_map import style_appearances  # noqa: E402
from ufc_embedded.train import (  # noqa: E402
    LR_CS,
    PROJECT,
    build,
    logistic,
    lr_inputs,
    wandb_mode,
)

HALF_LIVES = [2.0, 3.0, 4.0, 6.0, 8.0, 12.0, 16.0]
WINDOWS = [3, 5, 8, 12]
DRIFT_WINDOW = 4  # years per window in the feature-weight drift plot
OUT = Path(__file__).resolve().parents[2] / "docs" / "experiments"
# Features whose weight over time is plotted (the strongest and the style-related ones).
DRIFT_FEATURES = {
    "d_glicko": "Glicko rating",
    "d_age": "Age",
    "d_td15": "Takedowns / 15 min",
    "d_ctrl_share": "Control time",
    "d_slpm": "Strikes landed / min",
    "d_str_def": "Strike defence",
    "d_ew_won": "Recent results",
    "d_reach": "Reach",
}


def years_before(dates: pd.Series, year: int) -> np.ndarray:
    """How many years each date is before 1 January of ``year``."""
    days = (pd.Timestamp(year=year, month=1, day=1) - dates).dt.days.to_numpy()
    out: np.ndarray = np.clip(days / 365.25, 0, None)
    return out


def variant_weights(train: pd.DataFrame, year: int, variant: dict[str, Any]) -> np.ndarray:
    """Sample weights for one variant: all 1, halving every ``half_life`` years, or 1 inside
    the last ``window`` years and 0 before."""
    age = years_before(train["date"], year)
    if "half_life" in variant:
        w: np.ndarray = 0.5 ** (age / variant["half_life"])
        return w
    if "window" in variant:
        inside: np.ndarray = (age < variant["window"]).astype(float)
        return inside
    return np.ones(len(train))


def rolling_predictions(
    m: pd.DataFrame, x: list[str], variant: dict[str, Any], C: float
) -> np.ndarray:
    """Out-of-fold P(A wins) for every fight of ``CV_YEARS``, one model per year."""
    year = m["date"].dt.year
    preds = []
    for y in CV_YEARS:
        train, test = m[year < y], m[year == y]
        w = variant_weights(train, y, variant)
        keep = w > 0
        model = logistic(C).fit(
            train.loc[keep, x], train.loc[keep, "y"], logisticregression__sample_weight=w[keep]
        )
        preds.append(model.predict_proba(test[x])[:, 1])
    return np.concatenate(preds)


def log_losses(y: np.ndarray, p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    out: np.ndarray = -(y * np.log(p) + (1 - y) * np.log(1 - p))
    return out


def per_year_loss(oof: pd.DataFrame, col: str) -> float:
    """Mean over the validation years of each year's log loss (what ``train.py`` tunes on)."""
    return float(
        np.mean([metrics(d["y"], d[col])["log_loss"] for _, d in oof.groupby(oof["date"].dt.year)])
    )


def bootstrap_gain(
    y: np.ndarray, p_base: np.ndarray, p_new: np.ndarray, n: int = 4000, seed: int = 0
) -> tuple[float, float, float]:
    """Mean log-loss gain of ``p_new`` over ``p_base`` (positive = better) and its 95%
    interval, resampling fights with replacement."""
    diff = log_losses(y, p_base) - log_losses(y, p_new)
    rng = np.random.default_rng(seed)
    means = diff[rng.integers(0, len(diff), (n, len(diff)))].mean(axis=1)
    return float(diff.mean()), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def run_variants(m: pd.DataFrame, x: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Every variant, C tuned for each. Returns a results table and the out-of-fold
    predictions (one ``p_<variant>`` column each)."""
    variants: list[tuple[str, dict[str, Any]]] = [("all fights equal", {})]
    variants += [(f"half-life {h:g}y", {"half_life": h}) for h in HALF_LIVES]
    variants += [(f"last {w} years", {"window": w}) for w in WINDOWS]
    oof = m[m["date"].dt.year.isin(CV_YEARS)].copy()
    rows = []
    for name, variant in variants:
        best: tuple[float, float, np.ndarray] | None = None
        for C in LR_CS:
            oof["_p"] = rolling_predictions(m, x, variant, C)
            loss = per_year_loss(oof, "_p")
            if best is None or loss < best[0]:
                best = (loss, C, oof["_p"].to_numpy())
        assert best is not None
        oof[f"p_{name}"] = best[2]
        scores = metrics(oof["y"], best[2])
        rows.append(
            {
                "variant": name,
                **variant,
                "C": best[1],
                "mean_year_log_loss": best[0],
                "log_loss": scores["log_loss"],
                "accuracy": scores["accuracy"],
                "brier": scores["brier"],
                "ece": scores["ece"],
            }
        )
        print(f"  {name:<20} C={best[1]:<6g} log loss {best[0]:.4f}  acc {scores['accuracy']:.3f}")
    oof = oof.drop(columns="_p")
    table = pd.DataFrame(rows)
    y = oof["y"].to_numpy()
    base = oof["p_all fights equal"].to_numpy()
    gains = [bootstrap_gain(y, base, oof[f"p_{v}"].to_numpy()) for v in table["variant"]]
    table["gain"], table["gain_lo"], table["gain_hi"] = zip(*gains, strict=True)
    return table, oof


def feature_drift(m: pd.DataFrame, x: list[str], C: float) -> pd.DataFrame:
    """The win model's weight on each of ``DRIFT_FEATURES`` fit on sliding windows of
    ``DRIFT_WINDOW`` years (before the test years only). Features are put on one scale (the
    spread over all those fights) so a weight means the same in every window: the change in
    log-odds for one typical difference. ``C`` is the deployed model's, fit on all of them."""
    past = m[m["date"] < TEST_START]
    scale = past[x].std(ddof=0).replace(0, 1)
    rows = []
    last = TEST_START.year - DRIFT_WINDOW
    for start in range(2005, last + 1):
        w = past[(past["date"].dt.year >= start) & (past["date"].dt.year < start + DRIFT_WINDOW)]
        # sklearn's penalty is fixed while the loss grows with the fights, so C is scaled by
        # the window's share of the fights: every window gets the same pull towards 0.
        c = C * len(past) / len(w)
        fit = LogisticRegression(C=c, fit_intercept=False, max_iter=2000).fit(w[x] / scale, w["y"])
        coef = dict(zip(x, fit.coef_[0], strict=True))
        rows.append(
            {
                "window": f"{start}-{start + DRIFT_WINDOW - 1}",
                "mid": start + DRIFT_WINDOW / 2,
                "n": len(w),
                **{f: coef[f] for f in DRIFT_FEATURES},
            }
        )
    return pd.DataFrame(rows)


def style_drift() -> pd.DataFrame:
    """How the sport changed, per year: where significant strikes went and came from,
    output and takedowns (fight stats only, no results)."""
    app = style_appearances(load_raw())
    g = app.groupby(app["date"].dt.year)[
        ["leg_att", "body_att", "clinch_att", "ground_att", "sig_att", "td_succ", "minutes"]
    ].sum()
    out = 100 * g[["leg_att", "body_att", "clinch_att", "ground_att"]].div(g["sig_att"], axis=0)
    out.columns = ["Leg", "Body", "Clinch", "Ground"]
    out["Strikes thrown / min"] = g["sig_att"] / g["minutes"]
    out["Takedowns / 15 min"] = 15 * g["td_succ"] / g["minutes"]
    return out[out.index >= 1997]


def plot_style_drift(d: pd.DataFrame, path: Path) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.2))
    for col in ["Leg", "Body", "Clinch", "Ground"]:
        axes[0].plot(d.index, d[col], label=col, lw=2)
    axes[0].set(title="Where significant strikes go / come from", ylabel="% of significant strikes")
    axes[0].legend(frameon=False)
    ax = axes[1]
    ax.plot(d.index, d["Strikes thrown / min"], color="C3", lw=2, label="Strikes thrown / min")
    ax.set(title="Output and takedowns", ylabel="significant strikes thrown / min")
    ax2 = ax.twinx()
    ax2.plot(
        d.index, d["Takedowns / 15 min"], color="C0", lw=2, ls="--", label="Takedowns / 15 min"
    )
    ax2.set_ylabel("takedowns / 15 min")
    ax.legend(handles=ax.get_lines() + ax2.get_lines(), frameon=False, loc="lower right")
    for a in axes:
        a.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_variants(table: pd.DataFrame, path: Path) -> None:
    """Gain over the baseline per variant, with its bootstrap interval."""
    t = table[table["variant"] != "all fights equal"].iloc[::-1]
    fig, ax = plt.subplots(figsize=(8, 4.8))
    ypos = np.arange(len(t))
    colors = [
        "C2" if lo > 0 else "C3" if hi < 0 else "0.45"
        for lo, hi in zip(t["gain_lo"], t["gain_hi"], strict=True)
    ]
    for yp, (_, r), c in zip(ypos, t.iterrows(), colors, strict=True):
        ax.plot([1000 * r["gain_lo"], 1000 * r["gain_hi"]], [yp, yp], color=c, lw=2)
    ax.scatter(1000 * t["gain"], ypos, c=colors, zorder=3)
    ax.axvline(0, color="k", lw=1)
    ax.set_yticks(ypos, t["variant"])
    ax.set(
        xlabel="log-loss gain over 'all fights equal' (×1000; right = better)",
        title="Favouring recent fights: rolling validation 2019-23, 95% bootstrap intervals",
    )
    ax.grid(axis="x", alpha=0.25)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_per_year(oof: pd.DataFrame, cols: list[str], path: Path) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.2))
    years = sorted(oof["date"].dt.year.unique())
    for col in cols:
        losses = [
            metrics(d["y"], d[f"p_{col}"])["log_loss"] for _, d in oof.groupby(oof["date"].dt.year)
        ]
        axes[0].plot(years, losses, marker="o", lw=2, label=col)
        cal = calibration_table(oof["y"], oof[f"p_{col}"])
        cal = cal[cal["n"] >= 20]
        axes[1].plot(cal["predicted"], cal["observed"], marker="o", lw=2, label=col)
    axes[0].set(
        title="Log loss per validation year (lower is better)", xlabel="year", ylabel="log loss"
    )
    axes[0].set_xticks(years)
    axes[1].plot([0, 1], [0, 1], color="k", lw=1, ls=":")
    axes[1].set(
        title="Calibration (bins with 20+ fights)",
        xlabel="predicted P(A wins)",
        ylabel="how often A won",
    )
    for a in axes:
        a.grid(alpha=0.25)
        a.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_feature_drift(d: pd.DataFrame, path: Path) -> None:
    fig, ax = plt.subplots(figsize=(10, 5))
    for i, (f, label) in enumerate(DRIFT_FEATURES.items()):
        ax.plot(d["mid"], d[f], lw=2, marker="o", ms=3, label=label, color=f"C{i}")
    ax.axhline(0, color="k", lw=1)
    ax.set(
        title=f"Win model weight per feature, fit on sliding {DRIFT_WINDOW}-year windows",
        xlabel="window centre",
        ylabel="weight (log-odds per typical difference)",
    )
    ax.legend(frameon=False, ncol=2, fontsize=9)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--wandb", default="auto", choices=["auto", "online", "offline", "disabled"]
    )
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    print("building features...")
    data = build()
    m = data.m
    x = lr_inputs("v2")

    print("variants (rolling validation 2019-23):")
    table, oof = run_variants(m, x)
    base_C = float(table.loc[table["variant"] == "all fights equal", "C"].iloc[0])
    drift = feature_drift(m, x, base_C)
    styles = style_drift()

    best = table.iloc[1 + int(np.argmin(table["mean_year_log_loss"].to_numpy()[1:]))]
    plots = {
        "style_drift": (plot_style_drift, (styles,)),
        "variants": (plot_variants, (table,)),
        "per_year": (plot_per_year, (oof, ["all fights equal", best["variant"]])),
        "feature_drift": (plot_feature_drift, (drift,)),
    }
    paths = {}
    for name, (fn, fn_args) in plots.items():
        paths[name] = OUT / f"recency-{name}.png"
        fn(*fn_args, paths[name])  # type: ignore[operator]
    table.round(5).to_csv(OUT / "recency-results.csv", index=False)
    drift.round(4).to_csv(OUT / "recency-feature-drift.csv", index=False)

    print()
    print(
        table[["variant", "C", "mean_year_log_loss", "accuracy", "gain", "gain_lo", "gain_hi"]]
        .round(4)
        .to_string(index=False)
    )
    print("\nfeature weights per window:")
    print(drift.drop(columns="mid").round(3).to_string(index=False))
    print(f"\nplots in {OUT}")

    mode = wandb_mode(args.wandb)
    if mode == "disabled":
        return
    import wandb

    run = wandb.init(
        project=PROJECT,
        job_type="experiment",
        name="recency-weighting",
        mode=mode,  # type: ignore[arg-type]
        config={
            "half_lives": HALF_LIVES,
            "windows": WINDOWS,
            "cv_years": CV_YEARS,
            "features": "v2",
            "drift_window": DRIFT_WINDOW,
        },
    )
    run.log(
        {
            "recency/results": wandb.Table(dataframe=table.round(5)),
            "recency/feature_drift": wandb.Table(dataframe=drift.round(4)),
            "recency/style_drift": wandb.Table(dataframe=styles.round(3).reset_index(names="year")),
            **{f"recency/{k}": wandb.Image(str(p)) for k, p in paths.items()},
        }
    )
    hl = table[table["variant"].str.startswith("half-life")]
    run.log(
        {
            "recency/log_loss_vs_half_life": wandb.plot.line(
                wandb.Table(dataframe=hl[["half_life", "mean_year_log_loss"]]),
                "half_life",
                "mean_year_log_loss",
                title="Rolling log loss vs half-life (years)",
            )
        }
    )
    run.summary.update(
        {
            "baseline_log_loss": float(table["mean_year_log_loss"].iloc[0]),
            "best_variant": best["variant"],
            "best_log_loss": float(best["mean_year_log_loss"]),
            "best_gain": float(best["gain"]),
            "best_gain_lo": float(best["gain_lo"]),
            "best_gain_hi": float(best["gain_hi"]),
        }
    )
    print(f"W&B: {run.url or 'offline run, upload with wandb sync'}")
    run.finish()


if __name__ == "__main__":
    main()
