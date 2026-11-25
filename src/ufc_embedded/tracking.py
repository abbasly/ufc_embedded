"""Live Weights & Biases logging for experiments: the run opens when the experiment starts and
every result is logged the moment it exists, so a run can be watched in W&B as it trains.

    tracker = Tracker("tree-models", args.wandb, config={...})
    tracker.log({"tuning/step": i, "tuning/log_loss": loss})   # inside the loops
    tracker.finish(summary={...}, tables={...}, images={...})  # plots and tables at the end

``--wandb disabled`` (or no login with ``offline``) keeps everything local.
"""

from pathlib import Path
from typing import Any

import pandas as pd
import wandb

from ufc_embedded.train import PROJECT, wandb_mode


class Tracker:
    def __init__(self, name: str, requested: str, config: dict[str, Any] | None = None) -> None:
        mode = wandb_mode(requested)
        self.run = (
            None
            if mode == "disabled"
            else wandb.init(
                project=PROJECT,
                job_type="experiment",
                name=name,
                mode=mode,  # type: ignore[arg-type]
                config=config or {},
            )
        )
        if self.run is not None:
            url = self.run.url or "offline run, upload with wandb sync"
            print(f"W&B (live): {url}", flush=True)

    def log(self, data: dict[str, Any]) -> None:
        """Log metrics now; they show up in W&B within seconds."""
        if self.run is not None:
            self.run.log(data)

    def finish(
        self,
        summary: dict[str, Any] | None = None,
        tables: dict[str, pd.DataFrame] | None = None,
        images: dict[str, Path] | None = None,
    ) -> None:
        if self.run is None:
            return
        self.run.log(
            {
                **{k: wandb.Table(dataframe=v) for k, v in (tables or {}).items()},
                **{k: wandb.Image(str(p)) for k, p in (images or {}).items()},
            }
        )
        self.run.summary.update(summary or {})
        print(f"W&B: {self.run.url or 'offline run, upload with wandb sync'}", flush=True)
        self.run.finish()
