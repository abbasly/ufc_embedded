"""Domain ideas for the win model, tested (``uv run python -m ufc_embedded.matchups_experiment``).

The deployed model only sees A − B differences of each fighter's own numbers, so it can't
tell that a wrestler's takedowns matter *against a poor takedown defender*. This tries, on the
same rolling validation as ``train.py`` (each year 2019-23 predicted from earlier years only):

1. **Matchup features**: what one fighter's strength meets in the other. Each is
   ``f(A, B) − f(B, A)``, so P(A beats B) = 1 − P(B beats A) still holds:
   - wrestling vs takedown defence: A's takedowns × (1 − B's takedown defence)
   - power vs chin: A's knockdowns × how often B gets dropped; A's KO wins × how often B
     gets finished
   - submissions vs being held down: A's sub attempts × B's time being controlled
   - striking vs defence: A's accuracy × (1 − B's strike defence)
2. **Stays standing, then power decides**: how likely the fight stays on the feet (both
   fighters' expected takedowns against the other's defence, low = standing), times the
   difference in power and in striking. Takedown defence first, then striking power.
3. **Finishing counts more**: the finishing features (gets finished, knocked down, KO power,
   recently finished) get less regularisation (scaled up 2× or 3× before the L2 penalty), to
   see whether the data agrees that they deserve more weight.
4. **Naive Bayes with a DAG**: Gaussian naive Bayes treats every feature as independent given
   the winner. Tree-augmented naive Bayes (TAN) learns a dependency tree between the features
   first (Chow-Liu, on conditional mutual information given the winner), so each feature
   depends on the winner and on one other feature. Both are scored like the rest.

Also: how much each feature predicts on its own, against how much weight the full model gives
it. Plots go to ``docs/experiments/`` and, with ``--wandb``, to Weights & Biases. Only fights
before 2024 are used: the test set stays locked.
"""

import argparse
import math
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import networkx as nx  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402

from ufc_embedded.evaluate import CV_YEARS, calibration_table, metrics  # noqa: E402
from ufc_embedded.recency import bootstrap_gain, per_year_loss  # noqa: E402
from ufc_embedded.tracking import Tracker  # noqa: E402
from ufc_embedded.train import FEATURE_LABELS, LR_CS, build, lr_inputs  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "docs" / "experiments"
FINISHING = ["d_finished_rate", "d_kd_absorbed15", "d_ko_win_rate", "d_ew_finished",
             "d_l3_finished", "d_kd15"]  # fmt: skip
MATCHUP_LABELS = {
    "mu_wrestle": "Wrestling vs TD defence",
    "mu_kd": "Knockdowns vs chin",
    "mu_ko": "KO wins vs gets finished",
    "mu_sub": "Sub attempts vs held down",
    "mu_strike": "Accuracy vs strike defence",
    "g_power": "Power, if it stays standing",
    "g_strike": "Striking, if it stays standing",
    "g_wrestle": "Wrestling, if it hits the mat",
}
MATCHUPS = ["d_mu_wrestle", "d_mu_kd", "d_mu_ko", "d_mu_sub", "d_mu_strike"]
GATED = ["d_g_power", "d_g_strike", "d_g_wrestle"]
# A small set with little overlap, for the Bayes models: they count correlated features again
# and again, which overwhelms them with all 54.
KEY = ["d_glicko", "d_pro_win_rate", "d_age", "d_reach", "d_mu_wrestle", "d_g_strike",
       "d_kd_absorbed15", "d_glicko_rd"]  # fmt: skip


def label(col: str) -> str:
    key = col.removeprefix("d_")
    return MATCHUP_LABELS.get(key, FEATURE_LABELS.get(key, key))


def add_matchups(m: pd.DataFrame) -> pd.DataFrame:
    """The matchup and stays-standing features, as A − B (see the module docstring)."""
    m = m.copy()

    def side(me: str, opp: str) -> dict[str, pd.Series]:
        def a(c: str) -> pd.Series:
            return m[f"{me}_{c}"]

        def b(c: str) -> pd.Series:
            return m[f"{opp}_{c}"]

        return {
            "wrestle": a("td15") * (1 - b("td_def")),
            "kd": a("kd15") * b("kd_absorbed15"),
            "ko": a("ko_win_rate") * b("finished_rate"),
            "sub": a("sub15") * b("ctrled_share"),
            "strike": a("str_acc") * (1 - b("str_def")),
        }

    sa, sb = side("a", "b"), side("b", "a")
    for k in sa:
        m[f"d_mu_{k}"] = sa[k] - sb[k]
    # How likely the fight stays standing: both fighters' expected takedowns against the
    # other's defence, through exp(-x / scale), with the scale making the median 0.5. No
    # results go into it, so using every fight for the scale leaks nothing.
    wrestling = sa["wrestle"] + sb["wrestle"]
    standing = np.exp(-wrestling / (wrestling.median() / math.log(2)))
    m["standing"] = standing
    m["d_g_power"] = (m["a_kd15"] - m["b_kd15"]) * standing
    m["d_g_strike"] = ((m["a_slpm"] - m["a_sapm"]) - (m["b_slpm"] - m["b_sapm"])) * standing
    m["d_g_wrestle"] = (sa["wrestle"] - sb["wrestle"]) * (1 - standing)
    return m


# --- Logistic regression variants ------------------------------------------------------


def rolling_lr(
    m: pd.DataFrame, x: list[str], C: float, boost: dict[str, float] | None = None
) -> tuple[np.ndarray, np.ndarray]:
    """Out-of-fold P(A wins) on ``CV_YEARS`` and the last fold's weights (per standardised
    input, as the model sees it). ``boost`` scales features up after standardising, which
    lightens their L2 penalty by the square: the model may give them more weight if the
    data supports it."""
    year = m["date"].dt.year
    factor = np.array([1.0 if boost is None else boost.get(c, 1.0) for c in x])
    preds, coef = [], np.zeros(len(x))
    for y in CV_YEARS:
        train, test = m[year < y], m[year == y]
        # Standardised here, not in a pipeline: a pipeline's scaler would undo the boost.
        scale = train[x].std(ddof=0).replace(0, 1).to_numpy() / factor
        model = LogisticRegression(C=C, fit_intercept=False, max_iter=3000)
        model.fit(train[x] / scale, train["y"])
        preds.append(model.predict_proba(test[x] / scale)[:, 1])
        coef = model.coef_[0] * factor  # per standard deviation of the input
    return np.concatenate(preds), coef


def tune_lr(
    m: pd.DataFrame,
    oof: pd.DataFrame,
    x: list[str],
    boost: dict[str, float] | None = None,
    tracker: Tracker | None = None,
    name: str = "",
) -> tuple[float, np.ndarray, np.ndarray]:
    best: tuple[float, float, np.ndarray, np.ndarray] | None = None
    for C in LR_CS:
        p, coef = rolling_lr(m, x, C, boost)
        loss = per_year_loss(oof.assign(_p=p), "_p")
        if best is None or loss < best[0]:
            best = (loss, C, p, coef)
        if tracker:
            tracker.log({f"tuning/{name}/log_loss": loss, f"tuning/{name}/C": C})
    assert best is not None
    return best[1], best[2], best[3]


# --- Naive Bayes and tree-augmented naive Bayes ------------------------------------------


def mirrored(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Every fight from both corners (B − A, B won), so the Bayes models are symmetric too."""
    return np.vstack([x, -x]), np.concatenate([y, 1 - y])


def chow_liu_tree(x: np.ndarray, y: np.ndarray) -> tuple[list[int], np.ndarray]:
    """The maximum spanning tree on conditional mutual information I(Xi; Xj | Y), Gaussian
    within each class, rooted at the feature most informative about Y. Returns each
    feature's parent (-1 for the root) and the information matrix."""
    p = x.shape[1]
    info = np.zeros((p, p))
    for c in (0, 1):
        r = np.corrcoef(x[y == c], rowvar=False)
        np.fill_diagonal(r, 0)
        info += 0.5 * -0.5 * np.log(np.clip(1 - r**2, 1e-9, None))
    g: nx.Graph[int] = nx.Graph()
    for i in range(p):
        for j in range(i + 1, p):
            g.add_edge(i, j, weight=info[i, j])
    tree = nx.maximum_spanning_tree(g)
    # Root: the feature whose class means differ most (in its own standard deviations).
    sd = x.std(axis=0) + 1e-12
    root = int(np.argmax(np.abs(x[y == 1].mean(0) - x[y == 0].mean(0)) / sd))
    parent = [-1] * p
    for u, v in nx.bfs_edges(tree, root):
        parent[v] = u
    return parent, info


class GaussianTAN:
    """Each feature is Gaussian given the winner and (TAN) its one parent feature:
    x_i | x_parent, y=c ~ N(a + b·x_parent, s²), all fit by least squares per class. With
    ``tree=False`` every feature has no parent: Gaussian naive Bayes."""

    def __init__(self, tree: bool = True) -> None:
        self.tree = tree

    def fit(self, x: np.ndarray, y: np.ndarray) -> "GaussianTAN":
        x, y = mirrored(x, y)
        p = x.shape[1]
        self.parent = chow_liu_tree(x, y)[0] if self.tree else [-1] * p
        self.cpd: dict[tuple[int, int], tuple[float, float, float]] = {}
        for c in (0, 1):
            xc = x[y == c]
            for i in range(p):
                if self.parent[i] < 0:
                    a, b, resid = xc[:, i].mean(), 0.0, xc[:, i] - xc[:, i].mean()
                else:
                    z = xc[:, self.parent[i]]
                    b, a = np.polyfit(z, xc[:, i], 1)
                    resid = xc[:, i] - (a + b * z)
                self.cpd[(c, i)] = (float(a), float(b), float(resid.var() + 1e-9))
        return self

    def log_likelihood(self, x: np.ndarray, c: int) -> np.ndarray:
        total = np.zeros(len(x))
        for i, par in enumerate(self.parent):
            a, b, var = self.cpd[(c, i)]
            mean = a + (b * x[:, par] if par >= 0 else 0.0)
            total += -0.5 * (np.log(2 * np.pi * var) + (x[:, i] - mean) ** 2 / var)
        return total

    def predict_proba(self, x: np.ndarray) -> np.ndarray:
        diff = self.log_likelihood(x, 1) - self.log_likelihood(x, 0)  # equal priors (mirrored)
        out: np.ndarray = 1 / (1 + np.exp(-np.clip(diff, -30, 30)))
        return out


def rolling_bayes(m: pd.DataFrame, x: list[str], tree: bool) -> np.ndarray:
    year = m["date"].dt.year
    preds = []
    for y in CV_YEARS:
        train, test = m[year < y], m[year == y]
        sd = train[x].std(ddof=0).replace(0, 1)
        model = GaussianTAN(tree).fit((train[x] / sd).to_numpy(), train["y"].to_numpy())
        preds.append(model.predict_proba((test[x] / sd).to_numpy()))
    return np.concatenate(preds)


# --- Plots -------------------------------------------------------------------------------


def plot_gains(table: pd.DataFrame, path: Path) -> None:
    t = table.iloc[1:].iloc[::-1]
    fig, ax = plt.subplots(figsize=(9, 0.45 * len(t) + 1.6))
    for yp, (_, r) in enumerate(t.iterrows()):
        c = "C2" if r["gain_lo"] > 0 else "C3" if r["gain_hi"] < 0 else "0.45"
        ax.plot([1000 * r["gain_lo"], 1000 * r["gain_hi"]], [yp, yp], color=c, lw=2)
        ax.scatter([1000 * r["gain"]], [yp], color=c, zorder=3)
    ax.axvline(0, color="k", lw=1)
    ax.set_yticks(range(len(t)), t["variant"])
    ax.set(
        xlabel="log-loss gain over the deployed model (×1000; right = better)",
        title="Domain ideas: rolling validation 2019-23, 95% bootstrap intervals",
    )
    ax.grid(axis="x", alpha=0.25)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_weights(weights: pd.DataFrame, path: Path) -> None:
    """Weight per feature in the baseline vs the model with matchups and gating."""
    w = weights.reindex(weights.abs().max(axis=1).sort_values().index).tail(26)
    fig, ax = plt.subplots(figsize=(9, 9))
    ypos = np.arange(len(w))
    h = 0.8 / len(w.columns)
    for k, col in enumerate(w.columns):
        ax.barh(ypos + (k - (len(w.columns) - 1) / 2) * h, w[col], height=h, label=col)
    ax.set_yticks(ypos, [label(c) for c in w.index])
    ax.axvline(0, color="k", lw=1)
    ax.set(xlabel="weight (log-odds per typical difference)",
           title="What the model leans on (26 largest)")  # fmt: skip
    ax.legend(frameon=False, loc="lower right")
    ax.grid(axis="x", alpha=0.25)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_alone_vs_together(alone: pd.Series, together: pd.Series, path: Path) -> None:
    """Each feature's predictive power on its own vs its weight in the full model."""
    fig, ax = plt.subplots(figsize=(10, 7))
    for col in alone.index:
        finishing = col in FINISHING or col in ("d_mu_kd", "d_mu_ko", "d_g_power")
        c = "C3" if finishing else "C0" if col.startswith(("d_mu_", "d_g_")) else "0.5"
        ax.scatter(1000 * alone[col], abs(together[col]), color=c, s=30)
        if alone[col] > alone.quantile(0.6) or abs(together[col]) > 0.07:
            ax.annotate(label(col), (1000 * alone[col], abs(together[col])), fontsize=8,
                        xytext=(4, 2), textcoords="offset points")  # fmt: skip
    ax.scatter([], [], color="C3", label="finishing / power")
    ax.scatter([], [], color="C0", label="matchup (new)")
    ax.scatter([], [], color="0.5", label="other")
    ax.set(
        xlabel="on its own: log-loss gain over a coin flip (×1000)",
        ylabel="in the full model: |weight|",
        title="Predictive alone vs weight once everything else is in",
    )
    ax.legend(frameon=False)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


GROUP_COLOURS = {"rating": "C0", "record": "C1", "body": "C2", "style": "C4", "form": "C5",
                 "finishing": "C3", "matchup": "C6"}  # fmt: skip


def group(col: str) -> str:
    if col in FINISHING or col in ("d_mu_kd", "d_mu_ko", "d_g_power"):
        return "finishing"
    if col.startswith(("d_mu_", "d_g_")):
        return "matchup"
    k = col.removeprefix("d_")
    if k in ("glicko", "glicko_rd", "sos", "off_peak"):
        return "rating"
    if k.startswith(("ew_", "l3_")):
        return "form"
    if k in ("age", "height", "reach", "southpaw", "age_past32", "age_sq"):
        return "body"
    if k in ("ufc_fights", "ufc_minutes", "win_rate", "win_streak", "loss_streak", "pro_fights",
             "pro_win_rate", "layoff_years", "debut", "sub_win_rate"):  # fmt: skip
        return "record"
    return "style"


def plot_dag(x: list[str], parent: list[int], info: np.ndarray, path: Path) -> None:
    """The learned TAN tree: an arrow from each feature's parent, thicker for more shared
    information. (The winner, Y, points into every feature and isn't drawn.)"""
    g: nx.DiGraph[int] = nx.DiGraph()
    for i, par in enumerate(parent):
        g.add_node(i)
        if par >= 0:
            g.add_edge(par, i, w=info[par, i])
    pos = nx.kamada_kawai_layout(g.to_undirected())
    fig, ax = plt.subplots(figsize=(16, 12))
    widths = [0.6 + 6 * g[u][v]["w"] / info.max() for u, v in g.edges]
    nx.draw_networkx_edges(g, pos, ax=ax, width=widths, edge_color="0.55", arrowsize=10,
                           node_size=380)  # fmt: skip
    nx.draw_networkx_nodes(g, pos, ax=ax, node_size=380,
                           node_color=[GROUP_COLOURS[group(x[i])] for i in g.nodes])  # fmt: skip
    root = parent.index(-1)
    nx.draw_networkx_nodes(g, pos, nodelist=[root], ax=ax, node_size=700, node_color="none",
                           edgecolors="k", linewidths=2)  # fmt: skip
    for i, (px, py) in pos.items():
        ax.text(px, py + 0.035, label(x[i]), ha="center", fontsize=8)
    for name, c in GROUP_COLOURS.items():
        ax.scatter([], [], color=c, label=name, s=80)
    ax.legend(frameon=False, loc="lower left", fontsize=10)
    ax.set_title("Tree-augmented naive Bayes: the learned dependencies between features "
                 "(the circled root; thicker = more shared information)")  # fmt: skip
    ax.axis("off")
    fig.tight_layout()
    fig.savefig(path, dpi=130)
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


# --- Main ----------------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--wandb", default="auto",
                        choices=["auto", "online", "offline", "disabled"])  # fmt: skip
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    tracker = Tracker("domain-matchups", args.wandb, {
        "cv_years": CV_YEARS, "matchups": MATCHUPS, "gated": GATED,
        "finishing": FINISHING})  # fmt: skip

    print("building features...")
    m = add_matchups(build().m)
    base = lr_inputs("v2")
    oof = m[m["date"].dt.year.isin(CV_YEARS)].copy()

    lr_variants: list[tuple[str, list[str], dict[str, float] | None]] = [
        ("deployed (v2)", base, None),
        ("+ matchups", base + MATCHUPS, None),
        ("+ stays standing, then power", base + GATED, None),
        ("+ matchups + stays standing", base + MATCHUPS + GATED, None),
        ("finishing counts 2×", base, {c: 2.0 for c in FINISHING}),
        ("finishing counts 3×", base, {c: 3.0 for c in FINISHING}),
        ("all of it, finishing 2×", base + MATCHUPS + GATED,
         {c: 2.0 for c in FINISHING + ["d_mu_kd", "d_mu_ko", "d_g_power"]}),
    ]  # fmt: skip
    rows: list[dict[str, Any]] = []
    weights: dict[str, pd.Series] = {}
    print("logistic regression (rolling validation 2019-23):")
    for name, x, boost in lr_variants:
        C, p, coef = tune_lr(m, oof, x, boost, tracker, name)
        oof[f"p_{name}"] = p
        weights[name] = pd.Series(coef, index=x)
        rows.append({"variant": name, "model": "logistic", "inputs": len(x), "C": C})
        print(f"  {name:<34} C={C:<6g} {per_year_loss(oof, f'p_{name}'):.4f}", flush=True)
        tracker.log({f"result/{name}": per_year_loss(oof, f"p_{name}")})

    full = base + MATCHUPS + GATED
    print("Bayes models:")
    for name, x, tree in [
        ("naive Bayes (8 key inputs)", KEY, False),
        ("TAN (8 key inputs)", KEY, True),
        ("naive Bayes (deployed inputs)", base, False),
        ("naive Bayes (all inputs)", full, False),
        ("TAN (deployed inputs)", base, True),
        ("TAN (all inputs)", full, True),
    ]:
        oof[f"p_{name}"] = rolling_bayes(m, x, tree)
        rows.append({"variant": name, "model": "bayes", "inputs": len(x), "C": np.nan})
        print(f"  {name:<34} {per_year_loss(oof, f'p_{name}'):.4f}", flush=True)
        tracker.log({f"result/{name}": per_year_loss(oof, f"p_{name}")})

    table = pd.DataFrame(rows)
    y = oof["y"].to_numpy()
    p0 = oof["p_deployed (v2)"].to_numpy()
    for i, r in table.iterrows():
        p = oof[f"p_{r['variant']}"].to_numpy()
        s = metrics(y, p)
        g = bootstrap_gain(y, p0, p)
        table.loc[i, ["mean_year_log_loss", "log_loss", "accuracy", "ece"]] = [
            per_year_loss(oof, f"p_{r['variant']}"),
            s["log_loss"],
            s["accuracy"],
            s["ece"],
        ]
        table.loc[i, ["gain", "gain_lo", "gain_hi"]] = list(g)  # fmt: skip

    # Each feature alone: a one-input model on the same folds.
    print("each feature alone...")
    alone = {}
    for c in full:
        _, p, _ = tune_lr(m, oof, [c])
        alone[c] = math.log(2) - per_year_loss(oof.assign(_p=p), "_p")
        tracker.log({f"alone/{label(c)}": 1000 * alone[c]})
    alone_s = pd.Series(alone)

    # The TAN tree on all the fights before the test years, for the picture.
    train = m[m["date"].dt.year <= CV_YEARS[-1]]
    xs, ys = mirrored((train[full] / train[full].std(ddof=0)).to_numpy(), train["y"].to_numpy())
    parent, info = chow_liu_tree(xs, ys)
    edges = pd.DataFrame(
        [{"child": label(full[i]), "parent": label(full[par]), "info": info[par, i]}
         for i, par in enumerate(parent) if par >= 0]
    ).sort_values("info", ascending=False)  # fmt: skip

    w = pd.DataFrame({"deployed": weights["deployed (v2)"],
                      "+ matchups + standing": weights["+ matchups + stays standing"],
                      "finishing 2×": weights["finishing counts 2×"]})  # fmt: skip
    paths = {
        "gains": OUT / "matchups-gains.png",
        "weights": OUT / "matchups-weights.png",
        "alone": OUT / "matchups-alone-vs-together.png",
        "dag": OUT / "matchups-tan-dag.png",
        "calibration": OUT / "matchups-calibration.png",
    }
    plot_gains(table, paths["gains"])
    plot_weights(w, paths["weights"])
    plot_alone_vs_together(alone_s, weights["+ matchups + stays standing"], paths["alone"])
    plot_dag(full, parent, info, paths["dag"])
    shown = ["deployed (v2)", "+ matchups + stays standing", "naive Bayes (8 key inputs)",
             "TAN (8 key inputs)", "TAN (all inputs)"]  # fmt: skip
    plot_calibration(oof, shown, paths["calibration"])
    table.round(5).to_csv(OUT / "matchups-results.csv", index=False)
    edges.round(4).to_csv(OUT / "matchups-tan-edges.csv", index=False)
    w.round(4).rename(index=label).to_csv(OUT / "matchups-weights.csv")

    print()
    cols = ["variant", "inputs", "C", "mean_year_log_loss", "accuracy", "ece", "gain", "gain_lo",
            "gain_hi"]  # fmt: skip
    print(table[cols].round(4).to_string(index=False))
    print("\nweights of the finishing and matchup features:")
    show = [c for c in FINISHING + MATCHUPS + GATED if c in w.index]
    print(w.loc[show].rename(index=label).round(3).to_string())
    print("\nstrongest on their own (gain over a coin flip, x1000):")
    print(
        (1000 * alone_s)
        .sort_values(ascending=False)
        .head(12)
        .rename(index=label)
        .round(2)
        .to_string()
    )
    print("\nstrongest TAN dependencies:")
    print(edges.head(12).round(3).to_string(index=False))
    print(f"\nplots in {OUT}")

    weights_table = w.round(4).rename(index=label).reset_index(names="feature")
    alone_table = pd.DataFrame({"feature": [label(c) for c in alone_s.index],
                                "gain_x1000": (1000 * alone_s).round(3).to_numpy()})  # fmt: skip
    best = table.iloc[1:].sort_values("mean_year_log_loss").iloc[0]
    tracker.finish(
        summary={"baseline_log_loss": float(table["mean_year_log_loss"].iloc[0]),
                 "best_variant": best["variant"],
                 "best_log_loss": float(best["mean_year_log_loss"]),
                 "best_gain": float(best["gain"]), "best_gain_lo": float(best["gain_lo"]),
                 "best_gain_hi": float(best["gain_hi"])},
        tables={"matchups/results": table.round(5), "matchups/weights": weights_table,
                "matchups/alone": alone_table, "matchups/tan_edges": edges.round(4)},
        images={f"matchups/{k}": p for k, p in paths.items()},
    )  # fmt: skip


if __name__ == "__main__":
    main()
