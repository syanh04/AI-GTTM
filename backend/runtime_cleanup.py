"""Conservative runtime cleanup that never deletes videos or evidence images."""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


TEMPORARY_SUFFIXES = {".tmp", ".part", ".partial"}
TEMPORARY_NAME_MARKERS = (".tmp.", ".part.", ".partial.")


@dataclass(frozen=True)
class CleanupPolicy:
    debug_retention_hours: float = 168.0
    temporary_retention_hours: float = 24.0
    dry_run: bool = False


@dataclass
class CleanupResult:
    scanned_files: int = 0
    matched_debug_files: int = 0
    matched_temporary_files: int = 0
    deleted_debug_files: int = 0
    deleted_temporary_files: int = 0
    reclaimed_bytes: int = 0
    candidate_bytes: int = 0
    skipped_symlinks: int = 0
    errors: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "scanned_files": self.scanned_files,
            "matched_debug_files": self.matched_debug_files,
            "matched_temporary_files": self.matched_temporary_files,
            "deleted_debug_files": self.deleted_debug_files,
            "deleted_temporary_files": self.deleted_temporary_files,
            "reclaimed_bytes": self.reclaimed_bytes,
            "candidate_bytes": self.candidate_bytes,
            "skipped_symlinks": self.skipped_symlinks,
            "errors": self.errors,
        }


def directory_usage_bytes(root: str | os.PathLike[str]) -> int:
    """Return regular-file usage without following symlinks."""
    total = 0
    root_path = Path(root)
    if not root_path.is_dir():
        return 0
    for current_root, directory_names, file_names in os.walk(root_path, followlinks=False):
        directory_names[:] = [
            name for name in directory_names if not (Path(current_root) / name).is_symlink()
        ]
        for file_name in file_names:
            path = Path(current_root) / file_name
            try:
                if not path.is_symlink() and path.is_file():
                    total += path.stat().st_size
            except OSError:
                continue
    return total


def is_temporary_file(path: Path) -> bool:
    """Match only explicit intermediate-file naming conventions."""
    lower_name = path.name.lower()
    return path.suffix.lower() in TEMPORARY_SUFFIXES or any(
        marker in lower_name for marker in TEMPORARY_NAME_MARKERS
    )


def _iter_regular_files(root: Path) -> Iterable[Path]:
    if not root.is_dir():
        return
    for current_root, directory_names, file_names in os.walk(root, followlinks=False):
        directory_names[:] = [
            name for name in directory_names if not (Path(current_root) / name).is_symlink()
        ]
        for file_name in file_names:
            yield Path(current_root) / file_name


def _delete_candidate(
    path: Path,
    *,
    cutoff_timestamp: float,
    dry_run: bool,
    result: CleanupResult,
    category: str,
) -> None:
    result.scanned_files += 1
    try:
        if path.is_symlink():
            result.skipped_symlinks += 1
            return
        stat = path.stat()
        if not path.is_file() or stat.st_mtime > cutoff_timestamp:
            return
        if category == "debug":
            result.matched_debug_files += 1
        else:
            result.matched_temporary_files += 1
        result.candidate_bytes += stat.st_size
        if dry_run:
            return
        path.unlink()
        result.reclaimed_bytes += stat.st_size
        if category == "debug":
            result.deleted_debug_files += 1
        else:
            result.deleted_temporary_files += 1
    except OSError:
        result.errors += 1


def cleanup_runtime(
    *,
    debug_directory: str | os.PathLike[str],
    temporary_directories: Iterable[str | os.PathLike[str]],
    policy: CleanupPolicy,
    now_timestamp: float | None = None,
) -> CleanupResult:
    """Delete old debug files and explicit intermediate files only.

    Normal videos, crops, evidence images and database files never match the
    temporary policy. Debug files are isolated in their dedicated directory.
    """
    now = time.time() if now_timestamp is None else float(now_timestamp)
    result = CleanupResult()
    debug_cutoff = now - max(1.0, policy.debug_retention_hours) * 3600
    temporary_cutoff = now - max(1.0, policy.temporary_retention_hours) * 3600

    for path in _iter_regular_files(Path(debug_directory)):
        _delete_candidate(
            path,
            cutoff_timestamp=debug_cutoff,
            dry_run=policy.dry_run,
            result=result,
            category="debug",
        )

    for directory in temporary_directories:
        for path in _iter_regular_files(Path(directory)):
            if not is_temporary_file(path):
                result.scanned_files += 1
                continue
            _delete_candidate(
                path,
                cutoff_timestamp=temporary_cutoff,
                dry_run=policy.dry_run,
                result=result,
                category="temporary",
            )
    return result
