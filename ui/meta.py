import os
from pathlib import Path

name = "ThermoRawRead"
version = "1.5.0"
author = "Tarn Yeong Ching"
url = f"http://{name.lower()}.ctarn.io"
server = f"http://api.ctarn.io/{name}/{version}"
copyright = f"{name} {version}\nCopyright © 2025 {author}\n{url}"
homedir = os.path.join(Path.home(), f".{name}", f"v{'.'.join(version.split('.')[0:2])}")
