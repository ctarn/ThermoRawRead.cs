namespace ThermoRawRead;

using System.Text;

internal static class Program
{
    private static readonly HashSet<string> supported_outputs = new(StringComparer.OrdinalIgnoreCase)
    {
        "umz",
        "ms1",
        "ms2",
        "meth",
        "txt",
        "csv",
    };

    private static bool TryParseCommandLine(string[] args, out string path_in, out string path_out, out HashSet<string> outputs)
    {
        path_in = "";
        path_out = "";
        outputs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (args.Length == 2)
        {
            path_in = args[0];
            path_out = args[1];
            outputs.Add("umz");
            outputs.Add("meth");
            outputs.Add("txt");
            outputs.Add("csv");
            return true;
        }

        if (args.Length < 3) return false;

        path_in = args[^2];
        path_out = args[^1];

        for (var i = 0; i < args.Length - 2; i++)
        {
            var output = args[i].Trim();
            if (!output.StartsWith("--")) return false;
            output = output[2..];

            if (output.Equals("msx", StringComparison.OrdinalIgnoreCase))
            {
                outputs.Add("ms1");
                outputs.Add("ms2");
                continue;
            }

            if (!supported_outputs.Contains(output)) return false;
            outputs.Add(output);
        }

        return outputs.Count > 0;
    }

    public static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        if (TryParseCommandLine(args, out var path_in, out var path_out, out var outputs))
            new Reader(path_in, path_out).Run(outputs);
        else
            Console.WriteLine("usage: ThermoRawRead [--umz] [--ms1] [--ms2] [--meth] [--txt] [--csv] [--msx] path_input dir_output");
        return 0;
    }
}
