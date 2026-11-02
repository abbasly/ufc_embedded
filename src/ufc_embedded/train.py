"""Train and evaluate fight-outcome models, logging everything to Weights & Biases.

    uv run python -m ufc_embedded.train                  # tune on 2022-23, deploy v2
    uv run python -m ufc_embedded.train --features v1    # deploy the original feature set
    uv run python -m ufc_embedded.train --final          # also score the locked 2024+ test set

Models: the betting market (benchmark), Elo, a regularised logistic regression on
point-in-time feature differences, and a method model (KO/TKO, SUB, DEC given the winner).
Two feature sets: v1 (career stats + Elo) and v2 (+ recent form, age curve, Glicko rating
with uncertainty, strength of schedule). Both are compared on rolling yearly validation
(2019-23) every run; ``--features`` picks the one deployed. Also writes
``web/public/data/predictor.json`` for the site's predictor page.
W&B runs offline when not logged in; upload later with ``wandb sync``.
"""

import argparse
import json
import netrc
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np
import pandas as pd
import wandb
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, roc_curve
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import StandardScaler

from ufc_embedded.champions import current_champions, current_ranks
from ufc_embedded.data import (
    PROCESSED_DIR,
    attach_odds,
    fighter_summary,
    load_fights,
    load_market,
    load_odds,
    load_profiles,
    load_rankings,
    load_raw,
    public_ids,
)
from ufc_embedded.evaluate import (
    CV_YEARS,
    TEST_START,
    VAL_START,
    calibration_table,
    coverage_curve,
    metrics,
    multiclass_log_loss,
    rolling_folds,
    split,
)
from ufc_embedded.export import WEB_DATA_DIR, photos_by_id
from ufc_embedded.features import (
    FEATURES,
    FEATURES_V2,
    appearances,
    current_features,
    matchups,
    pre_fight_features,
    priors,
    with_upcoming,
)
from ufc_embedded.method import (
    EXTRA_INPUTS,
    LOSER_INPUTS,
    METHODS,
    WINNER_INPUTS,
    method_model,
    winner_view,
)
from ufc_embedded.ratings import START, elo, expected, glicko, schedule

PROJECT = "ufc-embedded"
ELO_KS = [16.0, 32.0, 48.0, 64.0, 80.0, 100.0, 120.0, 150.0, 200.0]
LR_CS = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1.0, 3.0]
METHOD_CS = [0.003, 0.01, 0.03, 0.1, 0.3, 1.0]
PREDICTOR_YEARS = 5  # fighters on the predictor page: last fight within this many years


@dataclass
class Data:
    fights: pd.DataFrame
    profiles: pd.DataFrame
    app: pd.DataFrame  # appearances (one row per fighter per fight)
    prior: dict[str, float]
    feats: pd.DataFrame  # pre-fight features per appearance
    m: pd.DataFrame  # matchups
    names: dict[str, str]


def build(seed: int = 0) -> Data:
    raw = load_raw()
    fights = attach_odds(load_fights(raw), load_odds())
    profiles = load_profiles(raw)
    app = appearances(raw)
    prior = priors(app, VAL_START)
    feats = pre_fight_features(app, prior, profiles[["wins", "losses", "draws"]])
    names = dict(zip(feats["id"], feats["name"], strict=False))
    m = with_ratings(feats, matchups(feats, fights, load_market(), seed))
    return Data(fights, profiles, app, prior, feats, m, names)


RATING_V2 = ["glicko", "glicko_rd", "sos", "off_peak"]


def rating_features(feats: pd.DataFrame) -> pd.DataFrame:
    """v2 rating inputs per appearance, on the same /400 scale as ``d_elo``."""
    g = glicko(feats)
    sched = schedule(feats, g["glicko"])
    return pd.DataFrame(
        {
            "glicko": (g["glicko"] - START) / 400,
            "glicko_rd": g["glicko_rd"] / 400,
            "sos": (sched["sos"] - START) / 400,
            "off_peak": sched["off_peak"] / 400,
        },
        index=feats.index,
    )


def with_ratings(feats: pd.DataFrame, m: pd.DataFrame) -> pd.DataFrame:
    """Add A's, B's and the difference of every v2 rating input to the matchups."""
    per_app = rating_features(feats)
    per_app.index = pd.MultiIndex.from_arrays([feats["fight"], feats["id"]])
    out = m.copy()
    for side in ("a", "b"):
        rows = per_app.reindex(pd.MultiIndex.from_arrays([out["fight"], out[side]]))
        for c in RATING_V2:
            out[f"{side}_{c}"] = rows[c].to_numpy()
    for c in RATING_V2:
        out[f"d_{c}"] = out[f"a_{c}"] - out[f"b_{c}"]
    return out


def with_elo(
    feats: pd.DataFrame, m: pd.DataFrame, k: float
) -> tuple[pd.DataFrame, dict[str, float]]:
    """Add A's and B's pre-fight Elo and Elo's P(A wins) to the matchups."""
    pre, final = elo(feats, k)
    rating = pd.Series(
        pre.to_numpy(), index=pd.MultiIndex.from_arrays([feats["fight"], feats["id"]])
    )
    out = m.copy()
    out["elo_a"] = rating.reindex(pd.MultiIndex.from_arrays([out["fight"], out["a"]])).to_numpy()
    out["elo_b"] = rating.reindex(pd.MultiIndex.from_arrays([out["fight"], out["b"]])).to_numpy()
    out["p_elo"] = [expected(a, b) for a, b in zip(out["elo_a"], out["elo_b"], strict=True)]
    out["d_elo"] = (out["elo_a"] - out["elo_b"]) / 400
    return out, final


# Per feature set: fighter features, then rating inputs (all used as A - B differences).
FEATURE_SETS: dict[str, list[str]] = {
    "v1": [*FEATURES, "elo"],
    "v2": [*FEATURES_V2, *RATING_V2],
}


def lr_inputs(version: str) -> list[str]:
    return [f"d_{c}" for c in FEATURE_SETS[version]]


def logistic(C: float) -> Pipeline:
    # No intercept and no centring: with A - B differences this guarantees
    # P(A beats B) = 1 - P(B beats A), whatever order the fighters come in.
    return make_pipeline(
        StandardScaler(with_mean=False), LogisticRegression(C=C, fit_intercept=False, max_iter=2000)
    )


def wandb_mode(requested: str) -> str:
    """``auto``: online if ``wandb login`` stored a key for wandb's configured server."""
    if requested != "auto":
        return requested
    host = urlparse(wandb.Settings().base_url).hostname or ""
    try:
        logged_in = bool(os.environ.get("WANDB_API_KEY")) or bool(
            netrc.netrc().authenticators(host)
        )
    except (FileNotFoundError, netrc.NetrcParseError):
        logged_in = False
    return "online" if logged_in else "offline"


def line(xs: list[float], ys: list[float], x: str, y: str, title: str) -> Any:
    table = wandb.Table(data=[[a, b] for a, b in zip(xs, ys, strict=True)], columns=[x, y])
    return wandb.plot.line(table, x, y, title=title)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--final", action="store_true", help="also evaluate the locked test set")
    parser.add_argument(
        "--wandb", default="auto", choices=["auto", "online", "offline", "disabled"]
    )
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument(
        "--features", default="v2", choices=sorted(FEATURE_SETS), help="feature set to deploy"
    )
    args = parser.parse_args()
    inputs = lr_inputs(args.features)

    data = build(args.seed)
    feats, m, names = data.feats, data.m, data.names
    run = wandb.init(
        project=PROJECT,
        job_type="final" if args.final else "dev",
        mode=wandb_mode(args.wandb),  # type: ignore[arg-type]
        config={
            "val_start": str(VAL_START.date()),
            "feature_set": args.features,
            "features": FEATURE_SETS[args.features],
            "elo_ks": ELO_KS,
            "lr_Cs": LR_CS,
            "seed": args.seed,
            "n_matchups": len(m),
        },
    )

    # --- Elo: sweep K on validation log loss ---------------------------------------
    elo_losses = []
    for k in ELO_KS:
        mk, _ = with_elo(feats, m, k)
        val = split(mk)["val"]
        elo_losses.append(metrics(val["y"], val["p_elo"])["log_loss"])
        run.log({"elo/k": k, "elo/val_log_loss": elo_losses[-1]})
    best_k = ELO_KS[int(np.argmin(elo_losses))]
    m, final_elo = with_elo(feats, m, best_k)
    run.log(
        {"elo/k_sweep": line(ELO_KS, elo_losses, "K", "val log loss", "Elo: validation loss vs K")}
    )

    # --- Feature sets: tune C and compare v1 vs v2 on rolling yearly validation -------
    oof, best_Cs, sweeps = compare_feature_sets(m)
    for version, losses in sweeps.items():
        run.log(
            {
                f"lr/{version}/C_sweep": line(
                    [float(np.log10(c)) for c in LR_CS],
                    losses,
                    "log10 C",
                    "rolling val log loss",
                    f"Logistic regression {version}: rolling validation loss vs regularisation",
                )
            }
        )
    comparison = comparison_table(oof)
    print(f"rolling validation {CV_YEARS[0]}-{CV_YEARS[-1]}:")
    print(comparison.round(4).to_string(index=False))
    run.log({"compare/table": wandb.Table(dataframe=comparison.round(4))})
    log_comparison_curves(run, oof)
    PLOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    plot_comparison(oof, PLOT_PATH)
    run.log({"compare/figure": wandb.Image(str(PLOT_PATH))})
    print(f"wrote {PLOT_PATH}")

    best_C = best_Cs[args.features]
    parts = split(m)
    train = parts["train"]
    model = logistic(best_C).fit(train[inputs], train["y"])
    m["p_lr"] = model.predict_proba(m[inputs])[:, 1]
    run.config["best_elo_k"] = best_k
    run.config["best_lr_C"] = best_C

    # --- Evaluation: same fights for every model (those with market odds) -----------
    models = {"market": "p_market", "elo": "p_elo", "logistic": "p_lr"}
    splits = ["train", "val"] + (["test"] if args.final else [])
    rows: list[dict[str, Any]] = []
    parts = split(m)
    for name in splits:
        d = parts[name]
        common = d[d["p_market"].notna()]
        for model_name, col in models.items():
            scores = metrics(common["y"], common[col])
            rows.append({"split": name, "model": model_name, **scores})
            run.summary.update({f"{name}/{model_name}/{k}": v for k, v in scores.items()})
        # Our models also get scored on every fight, including those without odds.
        for model_name in ("elo", "logistic"):
            all_fights = metrics(d["y"], d[models[model_name]])["log_loss"]
            run.summary[f"{name}/{model_name}/all_fights_log_loss"] = all_fights
    results = pd.DataFrame(rows)
    run.log({"results": wandb.Table(dataframe=results)})
    print(results.round(4).to_string(index=False))

    # --- Calibration (the last evaluated split) -----------------------------------
    eval_split = splits[-1]
    d = parts[eval_split]
    d = d[d["p_market"].notna()]
    xs, ys, keys = [], [], []
    for model_name, col in models.items():
        t = calibration_table(d["y"], d[col])
        xs.append(t["predicted"].tolist())
        ys.append(t["observed"].tolist())
        keys.append(model_name)
    run.log(
        {
            "calibration": wandb.plot.line_series(
                xs=xs,
                ys=ys,
                keys=keys,
                title=f"Calibration on {eval_split} (predicted vs observed)",
                xname="predicted P(A wins)",
            )
        }
    )

    # --- Qualitative: what the model believes and where it goes wrong --------------
    coefs = pd.Series(model[-1].coef_[0], index=inputs).sort_values()
    run.log(
        {
            "lr/coefficients": wandb.plot.bar(
                wandb.Table(
                    data=[[str(k).removeprefix("d_"), float(v)] for k, v in coefs.items()],
                    columns=["feature", "weight"],
                ),
                "feature",
                "weight",
                title="Logistic regression weights (standardised A - B differences)",
            )
        }
    )
    view = parts[eval_split].assign(
        winner=lambda x: np.where(x["y"] == 1, x["a_name"], x["b_name"]),
        p_lr_winner=lambda x: np.where(x["y"] == 1, x["p_lr"], 1 - x["p_lr"]),
        p_market_winner=lambda x: np.where(x["y"] == 1, x["p_market"], 1 - x["p_market"]),
    )
    cols = [
        "date",
        "a_name",
        "b_name",
        "winner",
        "p_lr",
        "p_elo",
        "p_market",
        "p_lr_winner",
        "p_market_winner",
    ]
    view = view[cols].assign(date=lambda x: x["date"].dt.date.astype(str)).round(3)
    run.log(
        {
            "predictions": wandb.Table(dataframe=view),
            # Most confident wrong calls: what the model can't see.
            "worst_misses": wandb.Table(dataframe=view.nsmallest(25, "p_lr_winner")),
            # Where the model and the market disagree most, and who was right.
            "disagreements_with_market": wandb.Table(
                dataframe=view.assign(gap=(view["p_lr"] - view["p_market"]).abs()).nlargest(
                    25, "gap"
                )
            ),
            "elo_leaderboard": wandb.Table(
                dataframe=pd.DataFrame(
                    [
                        (names.get(f, f), round(r))
                        for f, r in sorted(final_elo.items(), key=lambda kv: -kv[1])[:25]
                    ],
                    columns=["fighter", "elo"],
                )
            ),
        }
    )

    # --- Method model: KO/TKO, SUB or DEC, given who wins ---------------------------
    x_tr, y_tr = winner_view(parts["train"])
    x_va, y_va = winner_view(parts["val"])
    base = y_tr.value_counts(normalize=True).reindex(METHODS)
    base_loss = multiclass_log_loss(
        y_va, pd.DataFrame([base.to_numpy()] * len(y_va), columns=METHODS)
    )
    method_losses = []
    for C in METHOD_CS:
        mm = method_model(C).fit(x_tr, y_tr)
        p = pd.DataFrame(mm.predict_proba(x_va), columns=mm.classes_)
        method_losses.append(multiclass_log_loss(y_va, p))
        run.log({"method/C": C, "method/val_log_loss": method_losses[-1]})
    best_mC = METHOD_CS[int(np.argmin(method_losses))]
    mm = method_model(best_mC).fit(x_tr, y_tr)
    p_va = pd.DataFrame(mm.predict_proba(x_va), columns=mm.classes_)[METHODS]
    run.config["best_method_C"] = best_mC
    run.summary.update(
        {
            "val/method/log_loss": min(method_losses),
            "val/method/base_rate_log_loss": base_loss,
            "val/method/accuracy": float(
                (p_va.idxmax(axis=1).to_numpy() == y_va.to_numpy()).mean()
            ),
        }
    )
    run.log(
        {
            "method/C_sweep": line(
                [float(np.log10(c)) for c in METHOD_CS],
                method_losses,
                "log10 C",
                "val log loss",
                "Method model: validation loss vs regularisation",
            ),
            # Does the model get the overall mix right? Predicted vs actual share per method.
            "method/shares": wandb.Table(
                dataframe=pd.DataFrame(
                    {
                        "method": METHODS,
                        "predicted": p_va.mean().round(3).to_numpy(),
                        "actual": y_va.value_counts(normalize=True)
                        .reindex(METHODS)
                        .round(3)
                        .to_numpy(),
                        "base_rate": base.round(3).to_numpy(),
                    }
                )
            ),
        }
    )

    # --- Export the deployed models for the website -------------------------------
    val_scores: dict[str, Any] = {
        str(r["model"]): {
            k: round(float(r[k]), 4) for k in ("log_loss", "accuracy", "brier", "ece", "n")
        }
        for r in rows
        if r["split"] == "val"
    }
    val_scores["method"] = {
        "log_loss": round(min(method_losses), 4),
        "base_rate_log_loss": round(base_loss, 4),
    }
    predictor = export_predictor(
        data, m, final_elo, best_k, args.features, best_C, best_mC, val_scores
    )
    predictor["rolling_validation"] = {
        str(r["model"]): {k: round(float(r[k]), 4) for k in ("log_loss", "accuracy", "auc")}
        for _, r in comparison.iterrows()
        if r["fights"] == "all"
    }
    out_json = WEB_DATA_DIR / "predictor.json"
    out_json.write_text(json.dumps(predictor, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {len(predictor['fighters'])} fighters to {out_json}")

    out = PROCESSED_DIR / "matchups.parquet"
    m.to_parquet(out)
    artifact = wandb.Artifact(
        "matchups",
        type="dataset",
        description="Point-in-time matchups with model and market probabilities",
    )
    artifact.add_file(str(out))
    run.log_artifact(artifact)
    model_artifact = wandb.Artifact(
        "predictor", type="model", description="Deployed win + method models"
    )
    model_artifact.add_file(str(out_json))
    run.log_artifact(model_artifact)
    run.finish()


PLOT_PATH = Path(__file__).resolve().parents[2] / "docs" / "model-comparison.png"
NICE = {"p_v1": "v1 (career stats + Elo)", "p_v2": "v2 (+ form, age, Glicko, schedule)",
        "p_elo": "Elo only", "p_market": "Betting market"}  # fmt: skip


def compare_feature_sets(
    m: pd.DataFrame,
) -> tuple[pd.DataFrame, dict[str, float], dict[str, list[float]]]:
    """Out-of-fold predictions of every feature set on the rolling validation years.

    C is tuned per feature set on mean rolling log loss. Returns the fights of
    ``CV_YEARS`` with ``p_<version>`` columns (plus Elo and market), the best C per set,
    and the loss curve over ``LR_CS`` per set.
    """
    folds = rolling_folds(m)
    oof = pd.concat([te for _, te in folds])
    best: dict[str, float] = {}
    sweeps: dict[str, list[float]] = {}
    for version in FEATURE_SETS:
        x = lr_inputs(version)
        losses = []
        for C in LR_CS:
            per_year = [
                metrics(te["y"], logistic(C).fit(tr[x], tr["y"]).predict_proba(te[x])[:, 1])
                for tr, te in folds
            ]
            losses.append(float(np.mean([s["log_loss"] for s in per_year])))
        best[version] = LR_CS[int(np.argmin(losses))]
        sweeps[version] = losses
        oof[f"p_{version}"] = np.concatenate(
            [
                logistic(best[version]).fit(tr[x], tr["y"]).predict_proba(te[x])[:, 1]
                for tr, te in folds
            ]
        )
    return oof, best, sweeps


def comparison_table(oof: pd.DataFrame) -> pd.DataFrame:
    """Every model's scores on all rolling-validation fights, and on those with odds."""
    rows = []
    with_odds = oof[oof["p_market"].notna()]
    for fights, d in (("all", oof), ("with odds", with_odds)):
        for col in [c for c in NICE if c in d]:
            if col == "p_market" and fights == "all":
                continue
            rows.append(
                {
                    "model": col.removeprefix("p_"),
                    "fights": fights,
                    **metrics(d["y"], d[col]),
                    "auc": float(roc_auc_score(d["y"], d[col])),
                }
            )
    return pd.DataFrame(rows)


def log_comparison_curves(run: Any, oof: pd.DataFrame) -> None:
    """Calibration, ROC and accuracy-vs-coverage curves per model, to W&B."""
    d = oof[oof["p_market"].notna()]
    cols = [c for c in NICE if c in d]
    curves: dict[str, tuple[list[list[float]], list[list[float]]]] = {
        "calibration": ([], []),
        "roc": ([], []),
        "coverage": ([], []),
    }
    for col in cols:
        cal = calibration_table(d["y"], d[col])
        curves["calibration"][0].append(cal["predicted"].tolist())
        curves["calibration"][1].append(cal["observed"].tolist())
        fpr, tpr, _ = roc_curve(d["y"], d[col])
        curves["roc"][0].append(fpr[::5].tolist())
        curves["roc"][1].append(tpr[::5].tolist())
        cov = coverage_curve(d["y"], d[col])
        curves["coverage"][0].append(cov["coverage"].tolist())
        curves["coverage"][1].append(cov["accuracy"].tolist())
    titles = {
        "calibration": ("Calibration (predicted vs observed)", "predicted P(A wins)"),
        "roc": ("ROC", "false positive rate"),
        "coverage": ("Accuracy vs share of fights picked", "coverage"),
    }
    for key, (xs, ys) in curves.items():
        title, xname = titles[key]
        run.log(
            {
                f"compare/{key}": wandb.plot.line_series(
                    xs=xs, ys=ys, keys=[NICE[c] for c in cols], title=title, xname=xname
                )
            }
        )


def plot_comparison(oof: pd.DataFrame, path: Path) -> None:
    """Calibration, accuracy-vs-coverage and ROC side by side, on fights with odds."""
    d = oof[oof["p_market"].notna()]
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.6))
    styles = {"p_v1": "C0", "p_v2": "C3", "p_elo": "C7", "p_market": "k"}
    for col, color in styles.items():
        label = NICE[col]
        cal = calibration_table(d["y"], d[col], bins=8)
        axes[0].plot(cal["predicted"], cal["observed"], "o-", color=color, label=label, ms=4)
        cov = coverage_curve(d["y"], d[col])
        axes[1].plot(cov["coverage"], cov["accuracy"], "o-", color=color, label=label, ms=4)
        fpr, tpr, _ = roc_curve(d["y"], d[col])
        auc = roc_auc_score(d["y"], d[col])
        axes[2].plot(fpr, tpr, color=color, label=f"{label} (AUC {auc:.3f})")
    axes[0].plot([0, 1], [0, 1], ":", color="grey")
    axes[0].set(title="Calibration", xlabel="predicted P(A wins)", ylabel="A actually won")
    axes[1].set(
        title="Accuracy when the model is at least 50, 55, ... 85% sure",
        xlabel="share of fights picked",
        ylabel="favourite won",
    )
    axes[1].invert_xaxis()
    axes[2].plot([0, 1], [0, 1], ":", color="grey")
    axes[2].set(title="ROC", xlabel="false positive rate", ylabel="true positive rate")
    for ax in axes:
        ax.grid(alpha=0.3)
    axes[2].legend(loc="lower right", fontsize=8)
    fig.suptitle(
        f"Rolling validation {CV_YEARS[0]}-{CV_YEARS[-1]}, {len(d)} fights with betting odds",
        fontsize=11,
    )
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


FEATURE_LABELS = {
    "ufc_fights": "UFC experience",
    "ufc_minutes": "Cage time",
    "win_rate": "UFC win rate",
    "win_streak": "Win streak",
    "loss_streak": "Losing streak",
    "ko_win_rate": "KO power",
    "sub_win_rate": "Submission wins",
    "finished_rate": "Gets finished",
    "pro_fights": "Pro fights",
    "pro_win_rate": "Pro win rate",
    "layoff_years": "Time off",
    "debut": "UFC debut",
    "age": "Age",
    "height": "Height",
    "reach": "Reach",
    "southpaw": "Southpaw",
    "slpm": "Strikes landed / min",
    "sapm": "Strikes absorbed / min",
    "str_acc": "Striking accuracy",
    "str_def": "Strike defence",
    "td15": "Takedowns / 15 min",
    "td_acc": "Takedown accuracy",
    "td_def": "Takedown defence",
    "sub15": "Sub attempts / 15 min",
    "ctrl_share": "Control time",
    "ctrled_share": "Time being controlled",
    "kd15": "Knockdowns / 15 min",
    "kd_absorbed15": "Knocked down / 15 min",
    "elo": "Elo rating",
    "ew_won": "Recent results",
    "ew_sig_diff": "Recent striking edge",
    "ew_td_diff": "Recent takedown edge",
    "ew_ctrl_diff": "Recent control edge",
    "ew_kd_diff": "Recent knockdown edge",
    "ew_finished": "Recently finished",
    "l3_won": "Last 3: results",
    "l3_sig_diff": "Last 3: striking edge",
    "l3_td_diff": "Last 3: takedown edge",
    "l3_ctrl_diff": "Last 3: control edge",
    "l3_kd_diff": "Last 3: knockdown edge",
    "l3_finished": "Last 3: finished",
    "age_past32": "Age past 32",
    "age_sq": "Age away from 30",
    "glicko": "Glicko rating",
    "glicko_rd": "Rating uncertainty",
    "sos": "Strength of schedule",
    "off_peak": "Below career peak",
}


def export_predictor(
    data: Data,
    m: pd.DataFrame,
    final_elo: dict[str, float],
    elo_k: float,
    version: str,
    lr_C: float,
    method_C: float,
    scores: dict[str, Any],
) -> dict[str, Any]:
    """Deployed models + every recently active fighter's features as of today, as JSON.

    Weights are fit on all fights before the locked test years; features use every fight.
    The win model is antisymmetric: P(A wins) = sigmoid(sum(w * (a - b) / scale)).
    """
    deploy = m[m["date"] < TEST_START]  # matchups with Elo columns
    inputs = FEATURE_SETS[version]
    win = logistic(lr_C).fit(deploy[lr_inputs(version)], deploy["y"])
    x_m, y_m = winner_view(deploy)
    meth = method_model(method_C).fit(x_m, y_m)
    order = [list(meth.classes_).index(c) for c in METHODS]

    as_of = data.fights["date"].max() + pd.Timedelta(days=1)
    record = data.profiles[["wins", "losses", "draws"]]
    now = current_features(data.app, data.prior, as_of, record)
    now = now[now["last_fight"] >= as_of - pd.DateOffset(years=PREDICTOR_YEARS)]
    now["elo"] = [final_elo.get(str(i), START) / 400 for i in now.index]
    # Ratings going into a hypothetical fight today, computed like any historical fight.
    feats_now = pre_fight_features(with_upcoming(data.app, as_of), data.prior, record)
    ratings_now = rating_features(feats_now)
    upcoming = feats_now["fight"].str.startswith("next-")
    ratings_now = ratings_now[upcoming].set_axis(feats_now.loc[upcoming, "id"])
    now = now.join(ratings_now)

    # For the Elo ladder: rating a year ago (None if they hadn't fought yet) and career peak.
    _, year_ago = elo(data.feats[data.feats["date"] < as_of - pd.Timedelta(days=365)], elo_k)
    pre, _ = elo(data.feats, elo_k)
    peak = pre.groupby(data.feats["id"]).max()

    ids = public_ids(data.profiles, fighter_summary(data.fights))
    rankings, rankings_date = load_rankings()
    ranks = current_ranks(rankings, data.profiles)
    belt = {
        c["fighter"]: c["division"]
        for c in current_champions(rankings, data.profiles)
        if c["fighter"]
    }
    photos = photos_by_id(data.profiles, [str(i) for i in now.index])
    records: dict[str, dict[str, int]] = {
        str(f): {str(k): int(v) for k, v in rec.items()}
        for f, rec in data.profiles[["wins", "losses", "draws"]].fillna(0).to_dict("index").items()
    }

    return {
        "schema_version": 2,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "fights_until": str(data.fights["date"].max().date()),
        "trained_until": str((TEST_START - pd.Timedelta(days=1)).date()),
        "feature_set": version,
        "rankings_as_of": rankings_date,
        "validation": scores,
        "feature_labels": FEATURE_LABELS,
        "win_model": {
            "inputs": inputs,
            "weights": [round(float(w), 5) for w in win[-1].coef_[0]],
            "scale": [round(float(s), 5) for s in win[0].scale_],
        },
        "method_model": {
            "classes": METHODS,
            "winner_inputs": WINNER_INPUTS,
            "loser_inputs": LOSER_INPUTS,
            "extra_inputs": EXTRA_INPUTS,
            "mean": [round(float(v), 5) for v in meth[0].mean_],
            "scale": [round(float(v), 5) for v in meth[0].scale_],
            "coef": [[round(float(v), 5) for v in meth[-1].coef_[i]] for i in order],
            "intercept": [round(float(meth[-1].intercept_[i]), 5) for i in order],
        },
        "fighters": [
            {
                "id": ids[str(i)],
                "name": str(r["name"]),
                "weight_class": str(r["weight_class"]),
                "last_fight": str(r["last_fight"].date()),
                "record": records[str(i)],
                "rank": ranks.get(str(i)),
                "champion": belt.get(str(i)),
                "image": photos.get(str(i)),
                "elo": round(float(r["elo"]) * 400),
                "elo_year_ago": round(year_ago[str(i)]) if str(i) in year_ago else None,
                "elo_peak": round(max(float(peak.get(i, 1500.0)), float(r["elo"]) * 400)),
                "x": [round(float(r[c]), 4) for c in inputs],
            }
            for i, r in now.iterrows()
        ],
    }


if __name__ == "__main__":
    main()
