"""A more general logistic regression: powers, curves and interactions of the features
(``uv run python -m ufc_embedded.polynomial_experiment``).

The deployed model is linear in the differences d = A − B. Swapping the corners turns every d
into −d, and P(A beats B) = 1 − P(B beats A) only holds if every term flips sign with it, so
only "odd" terms are allowed:

- **signed squares** d·|d|: big gaps count more than in proportion, sign kept;
- **cubes** d³;
- **splines**: a smooth free-form curve per feature (cubic B-splines on the differences),
  mirrored so that f(−d) = −f(d); the logistic regression then fits a curve per feature,
  like a generalised additive model;
- **gap × level** interactions d_i · (a_j + b_j) between the most important features: a gap
  can matter more or less depending on how much of something both fighters have (a reach gap
  between two high-rated fighters, say). Plain products d_i·d_j would break the symmetry.

Every variant is scored like the others: rolling validation 2019-23, regularisation tuned per
variant, gain over the deployed model with a 95% paired bootstrap interval, and live W&B
logging. The 2024+ test set stays locked.
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
from sklearn.preprocessing import SplineTransformer  # noqa: E402

from ufc_embedded.evaluate import CV_YEARS, metrics  # noqa: E402
from ufc_embedded.recency import bootstrap_gain, per_year_loss  # noqa: E402
from ufc_embedded.tracking import Tracker  # noqa: E402
from ufc_embedded.train import FEATURE_LABELS, build, lr_inputs  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "docs" / "experiments"
CS = [0.0003, 0.001, 0.003, 0.01, 0.03, 0.1]
# The strongest features in the deployed model, for the gap × level interactions.
TOP = ["pro_win_rate", "reach", "age", "glicko_rd", "sos", "td15", "sapm", "str_def",
       "glicko", "kd_absorbed15"]  # fmt: skip
CURVE_FEATURES = ["pro_win_rate", "reach", "age", "glicko_rd", "sos", "glicko", "td15", "sapm",
                  "str_def", "kd_absorbed15", "ufc_fights", "layoff_years"]  # fmt: skip


def label(key: str) -> str:
    return FEATURE_LABELS.get(key, key)


class Expansion:
    """Builds the extra columns for one variant. Fit on training fights only (the scale of
    each difference, the spline knots), then applied to any fights."""

    def __init__(self, kinds: set[str]) -> None:
        self.kinds = kinds

    def fit(self, m: pd.DataFrame, feats: list[str]) -> "Expansion":
        d = m[[f"d_{f}" for f in feats]]
        self.scale = d.std(ddof=0).replace(0, 1)
        self.splines: dict[str, SplineTransformer] = {}
        if "spline" in self.kinds:
            for f in CURVE_FEATURES:
                z = (m[f"d_{f}"] / self.scale[f"d_{f}"]).to_numpy()
                both = np.concatenate([z, -z])[:, None]  # knots symmetric around 0
                self.splines[f] = SplineTransformer(n_knots=6, degree=3, knots="quantile",
                                                    extrapolation="linear").fit(both)  # fmt: skip
        return self

    def transform(self, m: pd.DataFrame, feats: list[str]) -> pd.DataFrame:
        cols: dict[str, np.ndarray] = {}
        z = {f: (m[f"d_{f}"] / self.scale[f"d_{f}"]).to_numpy() for f in feats}
        for f in feats:
            cols[f"d_{f}"] = z[f]
        if "square" in self.kinds:
            for f in feats:
                cols[f"sq_{f}"] = z[f] * np.abs(z[f])
        if "cube" in self.kinds:
            for f in feats:
                cols[f"cube_{f}"] = z[f] ** 3
        if "spline" in self.kinds:
            for f, spl in self.splines.items():
                # Mirrored: B(d) − B(−d) flips sign when the corners swap.
                basis = spl.transform(z[f][:, None]) - spl.transform(-z[f][:, None])
                for k in range(basis.shape[1]):
                    cols[f"spl{k}_{f}"] = basis[:, k]
        if "interact" in self.kinds:
            for i in TOP:
                for j in TOP:
                    if i != j:
                        level = (m[f"a_{j}"] + m[f"b_{j}"]).to_numpy()
                        level = (level - level.mean()) / (level.std() + 1e-9)
                        cols[f"x_{i}_{j}"] = z[i] * level
        return pd.DataFrame(cols, index=m.index)


def rolling(
    m: pd.DataFrame, feats: list[str], kinds: set[str], C: float
) -> tuple[np.ndarray, pd.Series]:
    """Out-of-fold P(A wins) and the last fold's weights (per standardised column)."""
    year = m["date"].dt.year
    preds, coef = [], pd.Series(dtype=float)
    for y in CV_YEARS:
        train, test = m[year < y], m[year == y]
        exp = Expansion(kinds).fit(train, feats)
        xtr, xte = exp.transform(train, feats), exp.transform(test, feats)
        sd = xtr.std(ddof=0).replace(0, 1)  # no centring: centring would break the symmetry
        model = LogisticRegression(C=C, fit_intercept=False, max_iter=5000)
        model.fit(xtr / sd, train["y"])
        preds.append(model.predict_proba(xte / sd)[:, 1])
        coef = pd.Series(model.coef_[0], index=xtr.columns)
    return np.concatenate(preds), coef


def plot_gains(table: pd.DataFrame, path: Path) -> None:
    t = table.iloc[1:].iloc[::-1]
    fig, ax = plt.subplots(figsize=(9, 0.5 * len(t) + 1.6))
    for yp, (_, r) in enumerate(t.iterrows()):
        c = "C2" if r["gain_lo"] > 0 else "C3" if r["gain_hi"] < 0 else "0.45"
        ax.plot([1000 * r["gain_lo"], 1000 * r["gain_hi"]], [yp, yp], color=c, lw=2)
        ax.scatter([1000 * r["gain"]], [yp], color=c, zorder=3)
    ax.axvline(0, color="k", lw=1)
    ax.set_yticks(range(len(t)), [f"{v} ({n})" for v, n in zip(t["variant"], t["inputs"],
                                                                strict=True)])  # fmt: skip
    ax.set(xlabel="log-loss gain over the deployed model (×1000; right = better)",
           title="Powers, curves, interactions: rolling 2019-23, 95% bootstrap")  # fmt: skip
    ax.grid(axis="x", alpha=0.25)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_curves(m: pd.DataFrame, feats: list[str], C: float, path: Path) -> None:
    """The learned curve per feature (spline model, all fights before 2024), against the
    straight line of the deployed model: how the log-odds move with the gap."""
    train = m[m["date"].dt.year <= CV_YEARS[-1]]
    lin_exp = Expansion(set()).fit(train, feats)
    xl = lin_exp.transform(train, feats)
    sdl = xl.std(ddof=0)
    lin = LogisticRegression(C=C, fit_intercept=False, max_iter=5000).fit(xl / sdl, train["y"])
    lin_w = pd.Series(lin.coef_[0] / sdl.to_numpy(), index=xl.columns)
    exp = Expansion({"spline"}).fit(train, feats)
    x = exp.transform(train, feats)
    sd = x.std(ddof=0).replace(0, 1)
    model = LogisticRegression(C=C, fit_intercept=False, max_iter=5000).fit(x / sd, train["y"])
    w = pd.Series(model.coef_[0], index=x.columns) / sd
    fig, axes = plt.subplots(3, 4, figsize=(14, 9), sharey=True)
    grid = np.linspace(-2.5, 2.5, 101)
    for ax, f in zip(axes.flat, CURVE_FEATURES, strict=True):
        spl = exp.splines[f]
        basis = spl.transform(grid[:, None]) - spl.transform(-grid[:, None])
        curve = grid * w[f"d_{f}"] + sum(
            basis[:, k] * w[f"spl{k}_{f}"] for k in range(basis.shape[1])
        )
        ax.plot(grid, curve, lw=2, label="learned curve")
        ax.plot(grid, grid * lin_w[f"d_{f}"], lw=1.5, ls="--", color="0.4", label="straight line")
        ax.axhline(0, color="k", lw=0.6)
        ax.axvline(0, color="k", lw=0.6)
        ax.set_title(label(f), fontsize=10)
        ax.grid(alpha=0.25)
    axes[0, 0].legend(frameon=False, fontsize=8)
    fig.supxlabel("gap between the fighters (A − B, in standard deviations)")
    fig.supylabel("effect on log-odds of A winning")
    fig.suptitle("Per-feature curves (splines) vs the deployed straight lines")
    fig.tight_layout()
    fig.savefig(path, dpi=140)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--wandb", default="auto",
                        choices=["auto", "online", "offline", "disabled"])  # fmt: skip
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    variants: list[tuple[str, set[str]]] = [
        ("linear (deployed)", set()),
        ("+ signed squares", {"square"}),
        ("+ cubes", {"cube"}),
        ("+ signed squares + cubes", {"square", "cube"}),
        ("+ spline curves", {"spline"}),
        ("+ gap × level interactions", {"interact"}),
        ("+ curves + interactions", {"spline", "interact"}),
        ("everything", {"square", "cube", "spline", "interact"}),
    ]
    tracker = Tracker("polynomial-logistic", args.wandb, {
        "cv_years": CV_YEARS, "Cs": CS, "variants": [v for v, _ in variants], "top": TOP,
        "curve_features": CURVE_FEATURES})  # fmt: skip

    print("building features...", flush=True)
    m = build().m
    feats = [c.removeprefix("d_") for c in lr_inputs("v2")]
    oof = m[m["date"].dt.year.isin(CV_YEARS)].copy()

    rows: list[dict[str, Any]] = []
    step = 0
    for name, kinds in variants:
        best: tuple[float, float, np.ndarray, pd.Series] | None = None
        for C in CS:
            p, coef = rolling(m, feats, kinds, C)
            loss = per_year_loss(oof.assign(_p=p), "_p")
            step += 1
            print(f"    {name:<28} C={C:<7g} {loss:.4f}", flush=True)
            if best is None or loss < best[0]:
                best = (loss, C, p, coef)
            tracker.log({f"tuning/{name}/log_loss": loss, f"tuning/{name}/C": C,
                         "settings_tried": step})  # fmt: skip
        assert best is not None
        oof[f"p_{name}"] = best[2]
        rows.append({"variant": name, "inputs": len(best[3]), "C": best[1]})
        print(f"  {name:<30} {best[0]:.4f}  (C={best[1]}, {len(best[3])} inputs)", flush=True)
        tracker.log({f"result/{name}": best[0]})

    table = pd.DataFrame(rows)
    y = oof["y"].to_numpy()
    p0 = oof["p_linear (deployed)"].to_numpy()
    for i, r in table.iterrows():
        p = oof[f"p_{r['variant']}"].to_numpy()
        s = metrics(y, p)
        g = bootstrap_gain(y, p0, p)
        table.loc[i, ["mean_year_log_loss", "accuracy", "ece", "gain", "gain_lo", "gain_hi"]] = [
            per_year_loss(oof, f"p_{r['variant']}"), s["accuracy"], s["ece"], *g]  # fmt: skip

    paths = {"gains": OUT / "polynomial-gains.png", "curves": OUT / "polynomial-curves.png"}
    plot_gains(table, paths["gains"])
    spline_C = float(table.loc[table["variant"] == "+ spline curves", "C"].iloc[0])
    plot_curves(m, feats, spline_C, paths["curves"])
    table.round(5).to_csv(OUT / "polynomial-results.csv", index=False)

    print()
    cols = ["variant", "inputs", "C", "mean_year_log_loss", "accuracy", "ece", "gain", "gain_lo",
            "gain_hi"]  # fmt: skip
    print(table[cols].round(4).to_string(index=False))
    print(f"\nplots in {OUT}")
    best_row = table.iloc[1:].sort_values("mean_year_log_loss").iloc[0]
    tracker.finish(
        summary={"linear_log_loss": float(table["mean_year_log_loss"].iloc[0]),
                 "best_variant": best_row["variant"],
                 "best_log_loss": float(best_row["mean_year_log_loss"]),
                 "best_gain": float(best_row["gain"]), "best_gain_lo": float(best_row["gain_lo"]),
                 "best_gain_hi": float(best_row["gain_hi"])},
        tables={"polynomial/results": table.round(5)},
        images={f"polynomial/{k}": p for k, p in paths.items()},
    )  # fmt: skip


if __name__ == "__main__":
    main()
