"""Install into an explicitly chosen app home without replacing existing paths."""
from pathlib import Path
import os
import shutil
import sys


def install(destination):
    source = Path(__file__).resolve().parents[1]
    destination = Path(destination).expanduser()
    if not destination.is_absolute() or not destination.is_dir():
        raise ValueError("Choose an existing absolute app-home directory.")
    relative = [Path("layouts/fleet-tab.json"), Path("themes/fleet-tab.json"), Path("mods/fleet-tab")]
    for path in relative:
        if os.path.lexists(destination / path):
            raise FileExistsError(f"Refusing to overwrite: {destination / path}")
    files, directories = [], []
    try:
        for path in relative:
            parent = (destination / path).parent
            if not parent.exists():
                parent.mkdir()
                directories.append(parent)
        mod = destination / relative[2]
        mod.mkdir()
        directories.append(mod)
        sources = relative[:2] + [path.relative_to(source) for path in sorted((source / relative[2]).iterdir()) if path.is_file()]
        for path in sources:
            with (source / path).open("rb") as src, (destination / path).open("xb") as dst:
                files.append(destination / path)
                shutil.copyfileobj(src, dst)
    except Exception:
        for path in reversed(files):
            path.unlink()
        for path in reversed(directories):
            try:
                path.rmdir()
            except OSError:
                pass
        raise
    print("Installed Fleet Tab. No existing files were replaced.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 scripts/install.py /absolute/path/to/chosen/app-home")
    try:
        install(sys.argv[1])
    except (ValueError, OSError) as error:
        sys.exit(str(error))
