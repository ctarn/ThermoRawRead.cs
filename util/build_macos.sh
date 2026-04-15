name="ThermoRawRead"
content="tmp/$(uname -m).$(uname -s)"
dotnet build src/$name.csproj -c Release -o $content
out="tmp/release/$name-$(cat VERSION).$(uname -m).$(uname -s)"
rm -rf $out
python3 -m nuitka ui/$name.py \
    --mode=app \
    --assume-yes-for-downloads \
    --enable-plugin=tk-inter \
    --include-package-data=ttkbootstrap \
    --include-data-dir=$content=content \
    --include-data-files=fig/$name.png=content/$name.png \
    --macos-app-icon=fig/$name.png \
    --output-dir=$out \
    --output-filename=$name
productbuild --component $out/$name.app /Applications $out.pkg
