name="ThermoRawRead"
content="tmp/$(uname -m).$(uname -s)"
dotnet build -c Release -o $content
out="tmp/release/$name-$(cat VERSION).$(uname -m).$(uname -s)"
rm -rf $out
pyinstaller ui/$name.py -Fwy -i fig/$name.png --distpath $out --workpath tmp/build \
    --add-data $content:content \
    --hidden-import "ttkbootstrap" --hidden-import "PIL._tkinter_finder"
rm -rf $name.spec
