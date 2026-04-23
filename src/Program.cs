namespace ThermoRawRead;

using System.Text;

internal static class Program
{
    private static readonly HashSet<string> SupportedOutputs = new(StringComparer.OrdinalIgnoreCase)
        { "umz", "ms1", "ms2", "meth", "txt", "csv" };

    private static bool TryParseCommandLine(string[] args, out List<string> paths_in, out string path_out,
        out HashSet<string> formats, out bool recursive, out string error)
    {
        paths_in = [];
        path_out = "";
        recursive = false;
        error = "";
        formats = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < args.Length; i++)
        {
            var output = args[i].Trim();
            switch (output)
            {
                case "--out":
                case "-o":
                {
                    if (i + 1 >= args.Length)
                    {
                        error = $"missing output directory after {output}";
                        return false;
                    }
                    path_out = args[++i].Trim();
                    continue;
                }
                case "--recursive":
                case "-r":
                    recursive = true;
                    continue;
            }

            if (!output.StartsWith('-'))
            {
                paths_in.Add(output);
                continue;
            }
            if (!output.StartsWith("--"))
            {
                error = $"unknown argument: {output}";
                return false;
            }

            output = output[2..];
            if (output.Equals("msx", StringComparison.OrdinalIgnoreCase))
            {
                formats.Add("ms1");
                formats.Add("ms2");
                continue;
            }
            if (!SupportedOutputs.Contains(output))
            {
                error = $"unknown argument: --{output}";
                return false;
            }
            formats.Add(output);
        }

        if (paths_in.Count == 0)
        {
            error = "expected at least one input path";
            return false;
        }

        if (formats.Count != 0) return formats.Count > 0;

        formats.Add("umz");
        formats.Add("meth");
        formats.Add("txt");
        formats.Add("csv");
        return true;
    }

    private static bool IsRawFile(string path) { return path.EndsWith(".raw", StringComparison.OrdinalIgnoreCase); }

    private static bool TryResolveInputPaths(List<string> paths_in, bool recursive, out List<string> files_in,
        out string error)
    {
        files_in = [];
        error = "";

        foreach (var path_in in paths_in)
        {
            if (File.Exists(path_in))
            {
                if (!IsRawFile(path_in))
                {
                    error = $"input file is not a .raw file: {path_in}";
                    return false;
                }
                files_in.Add(path_in);
                continue;
            }

            if (Directory.Exists(path_in))
            {
                var option = recursive ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly;
                files_in.AddRange(Directory.EnumerateFiles(path_in, "*", option).Where(IsRawFile));
                continue;
            }

            error = $"input path does not exist: {path_in}";
            return false;
        }

        if (files_in.Count != 0) return true;
        error = "no .raw files found in input paths";
        return false;
    }

    public static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        if (!TryParseCommandLine(args, out var paths_in, out var path_out, out var formats, out var recursive,
                out var error)
            || !TryResolveInputPaths(paths_in, recursive, out var files_in, out error))
        {
            if (error != "") Console.WriteLine(error);
            Console.WriteLine(
                "usage: ThermoRawRead [--umz] [--ms1] [--ms2] [--meth] [--txt] [--csv] [--msx] [--recursive|-r] [--out dir_output|-o dir_output] path_input...");
            return -1;
        }
        foreach (var path_in in files_in)
        {
            var out_dir = path_out != "" ? path_out : Path.GetDirectoryName(path_in) ?? ".";
            new Reader(path_in, out_dir).Run(formats);
        }
        return 0;
    }
}
