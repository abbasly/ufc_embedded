"""Tree models against the deployed logistic regression (``uv run python -m
ufc_embedded.trees_experiment``).

On the same rolling validation as ``train.py`` (each year 2019-23 predicted from earlier years
only), with a small tuning grid per model chosen on mean rolling log loss:

- **Decision tree**: one tree, depth and leaf size tuned.
- **Random forest**: many deep trees on bootstrap samples, averaged.
- **Gradient boosting** (sklearn's histogram boosting, the LightGBM algorithm): shallow
  trees added one by one, each fixing the last ones' errors.

Each is fit on the A − B differences the logistic regression uses, and the forest and boosting
also on both fighters' own values side by side (A's and B's 46 features), which is what would
let a tree find matchups by itself (A's takedowns against B's takedown defence). Trees have no
built-in symmetry, so every fight is trained on from both corners and the two predictions are
averaged: P(A beats B) = 1 − P(B beats A) still holds.

Gains over the deployed model come with a 95% paired bootstrap interval. Only fights before
2024 are used. Plots go to ``docs/experiments/`` and, with ``--wandb``, to Weights & Biases.
"""

import argparse
import itertools
import time
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.base import ClassifierMixin, clone  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier  # noqa: E402
from sklearn.tree import DecisionTreeClassifier, plot_tree  # noqa: E402

from ufc_embedded.evaluate import CV_YEARS, calibration_table, metrics  # noqa: E402
from ufc_embedded.recency import bootstrap_gain, per_year_loss  # noqa: E402
from ufc_embedded.tracking import Tracker  # noqa: E402
from ufc_embedded.train import FEATURE_LABELS, LR_CS, build, logistic, lr_inputs  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "docs" / "experiments"
TRIED: list[str] = []  # every setting scored so far, for a running count in W&B
SEED = 0

GRIDS: dict[str, tuple[Any, dict[str, list[Any]]]] = {
    "decision tree": (
        DecisionTreeClassifier(random_state=SEED),
        {"max_depth": [2, 3, 4, 6, 8], "min_samples_leaf": [50, 150, 400]},
    ),
    "random forest": (
        RandomForestClassifier(n_estimators=300, n_jobs=-1, random_state=SEED),
        {"max_depth": [6, 10, None], "min_samples_leaf": [20, 60], "max_features": ["sqrt", 0.3]},
    ),
    "gradient boosting": (
        HistGradientBoostingClassifier(
            random_state=SEED, early_stopping=False, l2_regularization=1.0
        ),
        {"learning_rate": [0.01, 0.03], "max_depth": [1, 2, 3], "max_iter": [300, 1000],
         "min_samples_leaf": [50]},
    ),
}  # fmt: skip


def label(col: str) -> str:
    for prefix, side in (("d_", ""), ("a_", "A: "), ("b_", "B: ")):
        if col.startswith(prefix):
            key = col.removeprefix(prefix)
            return side + FEATURE_LABELS.get(key, key)
    return col


def side_inputs() -> list[str]:
    feats = [c.removeprefix("d_") for c in lr_inputs("v2")]
    return [f"a_{c}" for c in feats] + [f"b_{c}" for c in feats]


def flipped(x: pd.DataFrame) -> pd.DataFrame:
    """The same fights from the other corner: differences negated, or A's and B's columns
    swapped."""
    if all(c.startswith("d_") for c in x.columns):
        return -x
    swap = {c: ("b_" + c[2:] if c.startswith("a_") else "a_" + c[2:]) for c in x.columns}
    return x.rename(columns=swap)[x.columns]


def fit_symmetric(model: ClassifierMixin, x: pd.DataFrame, y: pd.Series) -> ClassifierMixin:
    """Fit on every fight from both corners."""
    fitted: ClassifierMixin = clone(model).fit(
        pd.concat([x, flipped(x)], ignore_index=True), np.concatenate([y, 1 - y])
    )
    return fitted


def predict_symmetric(model: Any, x: pd.DataFrame) -> np.ndarray:
    """Average of P(A wins) from A's corner and 1 − P(B wins) from B's."""
    p: np.ndarray = (model.predict_proba(x)[:, 1] + 1 - model.predict_proba(flipped(x))[:, 1]) / 2
    return p


def rolling(m: pd.DataFrame, x: list[str], model: Any) -> tuple[np.ndarray, Any]:
    """Out-of-fold P(A wins) on the validation years, and the last fold's model."""
    year = m["date"].dt.year
    preds, last = [], None
    for y in CV_YEARS:
        train, test = m[year < y], m[year == y]
        last = fit_symmetric(model, train[x], train["y"])
        preds.append(predict_symmetric(last, test[x]))
    return np.concatenate(preds), last


def tune(
    m: pd.DataFrame,
    oof: pd.DataFrame,
    x: list[str],
    base: Any,
    grid: dict[str, list[Any]],
    tracker: Tracker,
    variant: str,
) -> tuple[dict[str, Any], np.ndarray, Any, pd.DataFrame]:
    """Every combination in ``grid``, each logged to W&B as soon as it's scored; returns the
    best settings, their predictions, the last fold's model and the loss of every combination."""
    rows, best = [], None
    for i, values in enumerate(itertools.product(*grid.values())):
        params = dict(zip(grid, values, strict=True))
        p, last = rolling(m, x, clone(base).set_params(**params))
        loss = per_year_loss(oof.assign(_p=p), "_p")
        rows.append({**{k: str(v) for k, v in params.items()}, "log_loss": loss})
        print(f"    {params} -> {loss:.4f}", flush=True)
        if best is None or loss < best[0]:
            best = (loss, params, p, last)
        tracker.log({f"tuning/{variant}/log_loss": loss, f"tuning/{variant}/best": best[0],
                     f"tuning/{variant}/setting": i, "settings_tried": len(TRIED) + 1})  # fmt: skip
        TRIED.append(variant)
    assert best is not None
    return best[1], best[2], best[3], pd.DataFrame(rows)


def plot_gains(table: pd.DataFrame, path: Path) -> None:
    t = table.iloc[1:].iloc[::-1]
    fig, ax = plt.subplots(figsize=(9, 0.5 * len(t) + 1.6))
    for yp, (_, r) in enumerate(t.iterrows()):
        c = "C2" if r["gain_lo"] > 0 else "C3" if r["gain_hi"] < 0 else "0.45"
        ax.plot([1000 * r["gain_lo"], 1000 * r["gain_hi"]], [yp, yp], color=c, lw=2)
        ax.scatter([1000 * r["gain"]], [yp], color=c, zorder=3)
    ax.axvline(0, color="k", lw=1)
    ax.set_yticks(range(len(t)), t["variant"])
    ax.set(
        xlabel="log-loss gain over the deployed logistic regression (×1000; right = better)",
        title="Tree models: rolling validation 2019-23, 95% bootstrap intervals",
    )
    ax.grid(axis="x", alpha=0.25)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_calibration(oof: pd.DataFrame, cols: list[str], path: Path) -> None:
    fig, ax = plt.subplots(figsize=(6, 5.5))
    for col in cols:
        cal = calibration_table(oof["y"], oof[f"p_{col}"])
        cal = cal[cal["n"] >= 20]
        ax.plot(cal["predicted"], cal["observed"], marker="o", lw=2, label=col)
    ax.plot([0, 1], [0, 1], color="k", lw=1, ls=":")
    ax.set(title="Calibration (bins with 20+ fights)", xlabel="predicted P(A wins)",
           ylabel="how often A won")  # fmt: skip
    ax.legend(frameon=False, fontsize=9)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_tree_picture(model: DecisionTreeClassifier, x: list[str], path: Path) -> None:
    """The tuned single tree (its top 3 levels), as fit on fights up to 2022."""
    fig, ax = plt.subplots(figsize=(22, 9))
    plot_tree(model, max_depth=3, feature_names=[label(c) for c in x], class_names=["B", "A"],
              filled=True, impurity=False, proportion=True, rounded=True, fontsize=8,
              ax=ax)  # fmt: skip
    ax.set_title("The single decision tree (top 3 levels): 'value' is the share of fights A won")
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def plot_importance(imp: pd.DataFrame, path: Path) -> None:
    """Permutation importance (log-loss increase when a feature is shuffled) on 2023."""
    t = imp.sort_values("boosting").tail(15)
    fig, ax = plt.subplots(figsize=(9, 6.5))
    y = np.arange(len(t))
    ax.barh(y + 0.2, 1000 * t["logistic"], height=0.4, label="logistic regression")
    ax.barh(y - 0.2, 1000 * t["boosting"], height=0.4, label="gradient boosting")
    ax.set_yticks(y, [label(c) for c in t.index])
    ax.set(xlabel="log-loss increase when shuffled (×1000)",
           title="What each model relies on (2023 fights, top 15 for boosting)")  # fmt: skip
    ax.legend(frameon=False)
    ax.grid(axis="x", alpha=0.25)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--wandb", default="auto",
                        choices=["auto", "online", "offline", "disabled"])  # fmt: skip
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    grids = {k: {p: [str(v) for v in vs] for p, vs in g.items()} for k, (_, g) in GRIDS.items()}
    tracker = Tracker("tree-models", args.wandb, {"cv_years": CV_YEARS, "grids": grids})

    print("building features...")
    m = build().m
    diffs, sides = lr_inputs("v2"), side_inputs()
    oof = m[m["date"].dt.year.isin(CV_YEARS)].copy()

    # The deployed model, tuned as train.py does.
    best_lr: tuple[float, float, np.ndarray] | None = None
    year = m["date"].dt.year
    for C in LR_CS:
        p = np.concatenate([
            logistic(C).fit(m.loc[year < y, diffs], m.loc[year < y, "y"])
            .predict_proba(m.loc[year == y, diffs])[:, 1] for y in CV_YEARS
        ])  # fmt: skip
        loss = per_year_loss(oof.assign(_p=p), "_p")
        if best_lr is None or loss < best_lr[0]:
            best_lr = (loss, C, p)
    assert best_lr is not None
    oof["p_logistic regression (deployed)"] = best_lr[2]
    rows: list[dict[str, Any]] = [
        {"variant": "logistic regression (deployed)", "settings": f"C={best_lr[1]}", "seconds": 0}
    ]
    print(f"  logistic regression          {best_lr[0]:.4f}")
    tracker.log({"result/logistic regression (deployed)": best_lr[0]})

    fitted: dict[str, Any] = {}
    sweeps = []
    for name, (base, grid) in GRIDS.items():
        inputs = [("differences", diffs)]
        if name != "decision tree":
            inputs.append(("both fighters' values", sides))
        for kind, x in inputs:
            variant = f"{name} ({kind})"
            t0 = time.time()
            params, p, last, sweep = tune(m, oof, x, base, grid, tracker, variant)
            oof[f"p_{variant}"] = p
            fitted[variant] = last
            sweeps.append(sweep.assign(variant=variant))
            settings = ", ".join(f"{k}={v}" for k, v in params.items())
            rows.append(
                {"variant": variant, "settings": settings, "seconds": round(time.time() - t0)}
            )
            loss = per_year_loss(oof, f"p_{variant}")
            print(f"  {variant:<45} {loss:.4f}  [{settings}]", flush=True)
            tracker.log({f"result/{variant}": loss, "result/best_so_far": min(
                loss, *(per_year_loss(oof, f"p_{r['variant']}") for r in rows[1:]))})  # fmt: skip

    table = pd.DataFrame(rows)
    y_true = oof["y"].to_numpy()
    p0 = oof["p_logistic regression (deployed)"].to_numpy()
    for i, r in table.iterrows():
        p = oof[f"p_{r['variant']}"].to_numpy()
        s = metrics(y_true, p)
        g = bootstrap_gain(y_true, p0, p)
        table.loc[i, ["mean_year_log_loss", "accuracy", "ece", "gain", "gain_lo", "gain_hi"]] = [
            per_year_loss(oof, f"p_{r['variant']}"),
            s["accuracy"],
            s["ece"],
            *g,
        ]

    # Permutation importance on the last validation year, logistic vs boosting (differences).
    last_year = oof[oof["date"].dt.year == CV_YEARS[-1]]
    train = m[year < CV_YEARS[-1]]
    lr = logistic(best_lr[1]).fit(train[diffs], train["y"])
    boost = fitted["gradient boosting (differences)"]

    def importance(predict: Any, x: pd.DataFrame, y: pd.Series, reps: int = 10) -> np.ndarray:
        """Permutation importance: how much log loss rises when one feature is shuffled."""
        rng = np.random.default_rng(SEED)
        base = metrics(y, predict(x))["log_loss"]
        out = np.zeros(x.shape[1])
        for j, c in enumerate(x.columns):
            for _ in range(reps):
                shuffled = x.copy()
                shuffled[c] = rng.permutation(shuffled[c].to_numpy())
                out[j] += (metrics(y, predict(shuffled))["log_loss"] - base) / reps
        return out

    imp = pd.DataFrame(
        {
            "logistic": importance(lambda d: lr.predict_proba(d)[:, 1], last_year[diffs],
                                   last_year["y"]),
            "boosting": importance(lambda d: predict_symmetric(boost, d), last_year[diffs],
                                   last_year["y"]),
        },
        index=diffs,
    )  # fmt: skip

    paths = {
        "gains": OUT / "trees-gains.png",
        "calibration": OUT / "trees-calibration.png",
        "tree": OUT / "trees-decision-tree.png",
        "importance": OUT / "trees-importance.png",
    }
    plot_gains(table, paths["gains"])
    shown = ["logistic regression (deployed)", "decision tree (differences)",
             "random forest (differences)", "gradient boosting (differences)",
             "gradient boosting (both fighters' values)"]  # fmt: skip
    plot_calibration(oof, shown, paths["calibration"])
    plot_tree_picture(fitted["decision tree (differences)"], diffs, paths["tree"])
    plot_importance(imp, paths["importance"])
    table.round(5).to_csv(OUT / "trees-results.csv", index=False)
    pd.concat(sweeps).round(5).to_csv(OUT / "trees-sweeps.csv", index=False)

    print()
    cols = ["variant", "mean_year_log_loss", "accuracy", "ece", "gain", "gain_lo", "gain_hi"]
    print(table[cols].round(4).to_string(index=False))
    print("\npermutation importance on 2023 (x1000), top for boosting:")
    print(
        (1000 * imp)
        .sort_values("boosting", ascending=False)
        .head(10)
        .rename(index=label)
        .round(2)
        .to_string()
    )
    print(f"\nplots in {OUT}")

    importance_table = (1000 * imp).round(3).rename(index=label).reset_index(names="feature")
    best = table.iloc[1:].sort_values("mean_year_log_loss").iloc[0]
    tracker.finish(
        summary={"logistic_log_loss": float(table["mean_year_log_loss"].iloc[0]),
                 "best_tree_variant": best["variant"],
                 "best_tree_log_loss": float(best["mean_year_log_loss"]),
                 "best_tree_gain": float(best["gain"])},
        tables={"trees/results": table.round(5), "trees/sweeps": pd.concat(sweeps).round(5),
                "trees/importance": importance_table},
        images={f"trees/{k}": p for k, p in paths.items()},
    )  # fmt: skip


if __name__ == "__main__":
    main()
