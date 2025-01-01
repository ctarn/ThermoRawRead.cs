name="ThermoRawRead"
content="tmp/$(uname -m).$(uname -s)"
dotnet build src/$name.csproj -c Release -o $content
out="tmp/release/$name-$(cat VERSION).$(uname -m).$(uname -s)"
rm -rf $out
pyinstaller ui/$name.py -Dwy -i fig/$name.png --distpath $out --workpath tmp/build
mkdir $out/$name.app/Contents/MacOS/content
cp -R $content/ $out/$name.app/Contents/MacOS/content/
rm -rf $name.spec $out/$name
productbuild --component $out/$name.app /Applications $out.pkg
