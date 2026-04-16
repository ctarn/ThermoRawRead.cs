namespace ThermoRawRead.FileIO;

public static class TXT
{
    public static void Write(string path, string buffer_meta)
    {
        var writer_meta = new StreamWriter(path + ".txt~", false);
        writer_meta.Write(buffer_meta);
        writer_meta.Close();
        File.Delete(path + ".txt");
        File.Move(path + ".txt~", path + ".txt");
        Console.WriteLine($"file meta saved as {path}.txt");
    }
}
