"""Copy this package into an explicitly supplied app home, refusing name collisions."""
from pathlib import Path
import os
import shutil
import sys


def install(destination):
    source = Path(__file__).resolve().parents[1]
    home = Path(destination).expanduser().resolve()
    if not home.is_dir():
        raise ValueError("The destination must be an existing, explicitly selected app home.")
    relative = [Path("layouts/control-panel.json"), Path("mods/control-panel"), Path("themes/control-panel.json")]
    for path in relative:
        if os.path.lexists(home / path):
            raise FileExistsError(f"Refusing to overwrite: {home / path}")
    created_files, created_dirs = [], []
    try:
        for path in relative:
            parent = (home / path).parent
            if not parent.exists():
                parent.mkdir()
                created_dirs.append(parent)
        mod = home / relative[1]
        mod.mkdir()
        created_dirs.append(mod)
        files = [relative[0], relative[2], *[p.relative_to(source) for p in sorted((source / relative[1]).iterdir()) if p.is_file()]]
        for path in files:
            with (source / path).open("rb") as src, (home / path).open("xb") as dst:
                created_files.append(home / path)
                shutil.copyfileobj(src, dst)
    except Exception:
        for path in reversed(created_files):
            path.unlink()
        for path in reversed(created_dirs):
            try:
                path.rmdir()
            except OSError:
                pass
        raise
    print(f"Installed Control Panel into {home}. No existing files were replaced.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 scripts/install.py /absolute/path/to/chosen/app-home")
    try:
        install(sys.argv[1])
    except (OSError, ValueError) as error:
        sys.exit(str(error))
