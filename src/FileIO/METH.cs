namespace ThermoRawRead.FileIO;

using ThermoFisher.CommonCore.Data.Interfaces;

public static class METH
{
    public static void Write(IRawDataPlus raw, string path)
    {
        try
        {
            raw.ExportInstrumentMethod($"{path}.meth", true);
            Console.WriteLine($"method saved as {path}.meth");
        }
        catch (Exception e)
        {
            Console.WriteLine(e);
        }

        for (var i = 0; i < raw.InstrumentMethodsCount; i++)
        {
            var path_meth = raw.InstrumentMethodsCount == 1 ? $"{path}.meth.txt" : $"{path}.{i + 1}.meth.txt";
            var writer_meth = new StreamWriter(path_meth + "~", false);
            writer_meth.Write(raw.GetInstrumentMethod(i));
            writer_meth.Close();
            File.Delete(path_meth);
            File.Move(path_meth + "~", path_meth);
            Console.WriteLine($"method saved as {path_meth}");
        }

        for (var i = 0; i < raw.GetTuneDataCount(); i++)
        {
            var path_tune = raw.GetTuneDataCount() == 1 ? $"{path}.tune.txt" : $"{path}.{i + 1}.tune.txt";
            var writer_tune = new StreamWriter(path_tune + "~", false);
            var tune = raw.GetTuneData(i);
            for (var j = 0; j < tune.Length; j++)
                writer_tune.Write($"{tune.Labels[j]} {tune.Values[j]}\n");
            writer_tune.Close();
            File.Delete(path_tune);
            File.Move(path_tune + "~", path_tune);
            Console.WriteLine($"tune data saved as {path_tune}");
        }
    }
}
