using System;
using System.IO;

using ThermoFisher.CommonCore.Data.Business;
using ThermoFisher.CommonCore.Data.FilterEnums;
using ThermoFisher.CommonCore.Data.Interfaces;
using ThermoFisher.CommonCore.RawFileReader;

namespace ThermoRawRead
{
    public class MS
    {
        public MSOrderType ms_order;
        public int id = -1;
        public double total_ion_current = 0;
        public double base_peak_intensity = 0;
        public double base_peak_mass = 0;
        public string scan_mode = "";
        public double retention_time = 0;
        public double injection_time = 0;
        public string instrument_type;
        public double[] masses = {};
        public double[] intensities = {};

        // tandem
        public int precursor_scan = -1;
        public double activation_center = 0;
        public double isolation_width = 0;
        public double mz = 0;
        public int z = 0;
    }

    public class RawData
    {
        private readonly IRawDataPlus raw;
        private readonly string path_in;
        private readonly string path_out;
        private (int pre, int itime, int mz, int z, int width) idx = (-1, -1, -1, -1, -1);
        public const double MASS_PROTON = 1.007276466621;

        public RawData(string path_in, string path_out)
        {
            this.path_in = path_in;
            this.path_out = path_out;
            Console.WriteLine($"loading {path_in}");
            raw = RawFileReaderAdapter.FileFactory(path_in);
            raw.SelectInstrument(Device.MS, 1);

            var headers = raw.GetTrailerExtraHeaderInformation();
            for (int i = 0; i < headers.Length; i++)
            {
                if (headers[i].Label == "Ion Injection Time (ms):") idx.itime = i;
                if (headers[i].Label == "Monoisotopic M/Z:") idx.mz = i;
                if (headers[i].Label == "Charge State:") idx.z = i;
                if (headers[i].Label == "MS2 Isolation Width:") idx.width = i;
                if (headers[i].Label == "Master Scan Number:") idx.pre = i;
            }
        }

        public void Run()
        {
            string path = Path.Combine(path_out, Path.GetFileNameWithoutExtension(path_in));
            if (!Directory.Exists(path_out)) Directory.CreateDirectory(path_out);
            Console.WriteLine($"writing to {path}.ms1~");
            StreamWriter ms1 = new StreamWriter(path + ".ms1~", false);
            Console.WriteLine($"writing to {path}.ms2~");
            StreamWriter ms2 = new StreamWriter(path + ".ms2~", false);

            string instrument = $"Thermo {raw.GetInstrumentData().Name}";
            double duration = raw.RunHeader.ExpectedRuntime * 60;
            Console.WriteLine($"writing meta data");
            ms1.Write($"H\tInstrument\t{instrument}\nH\tDuration\t{duration}\n\n");
            ms2.Write($"H\tInstrument\t{instrument}\nH\tDuration\t{duration}\n\n");

            int last_ms1 = 0;
            for (int id = raw.RunHeaderEx.FirstSpectrum; id <= raw.RunHeaderEx.LastSpectrum; ++id)
            {
                if (id % 1000 == 0 || id == raw.RunHeaderEx.LastSpectrum)
                    Console.WriteLine($"writing scan data ({id} / {raw.RunHeaderEx.LastSpectrum})");
                var ms = Read(id);
                if (ms.ms_order == MSOrderType.Ms)
                {
                    last_ms1 = id;
                    WriteMS1(ms, ms1);
                }
                else if (ms.ms_order == MSOrderType.Ms2)
                {
                    if (idx.pre < 0) ms.precursor_scan = last_ms1;
                    WriteMS2(ms, ms2);
                }
            }
            raw.Dispose();
            ms1.Close();
            ms2.Close();
            File.Delete(path + ".ms1");
            File.Delete(path + ".ms2");
            File.Move(path + ".ms1~", path + ".ms1");
            Console.WriteLine($"saved to {path}.ms1");
            File.Move(path + ".ms2~", path + ".ms2");
            Console.WriteLine($"saved to {path}.ms2");
        }

        public MS Read(int id)
        {
            MS ms = new MS() { id = id };

            ms.retention_time = raw.RetentionTimeFromScanNumber(id) * 60;

            var scan_stats = raw.GetScanStatsForScanNumber(id);
            ms.total_ion_current = scan_stats.TIC;
            ms.base_peak_intensity = scan_stats.BasePeakIntensity;
            ms.base_peak_mass = scan_stats.BasePeakMass;
            ms.scan_mode = scan_stats.ScanType;

            var scan_event = raw.GetScanEventForScanNumber(id);
            ms.ms_order = scan_event.MSOrder;
            if (scan_event.MassAnalyzer == MassAnalyzerType.MassAnalyzerITMS) ms.instrument_type = "ITMS";
            if (scan_event.MassAnalyzer == MassAnalyzerType.MassAnalyzerFTMS) ms.instrument_type = "FTMS";

            if (idx.itime >= 0) ms.injection_time = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.itime));

            var scan = Scan.FromFile(raw, id);
            if (!scan.HasCentroidStream) scan = Scan.ToCentroid(scan);
            if (scan.CentroidScan.Masses != null && scan.CentroidScan.Intensities != null)
            {
                ms.masses = scan.CentroidScan.Masses;
                ms.intensities = scan.CentroidScan.Intensities;
            } else
            {
                Console.WriteLine($"[WARN] fail to read centroid data from scan #{id}");
            }

            if (ms.ms_order == MSOrderType.Ms) return ms;

            ms.activation_center = scan_event.GetMass(0);
            if (idx.z >= 0) ms.z = Convert.ToInt32(raw.GetTrailerExtraValue(id, idx.z));
            if (scan_event.Polarity == PolarityType.Negative) ms.z = -ms.z;
            if (idx.mz >= 0) ms.mz = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.mz));
            if (idx.width >= 0) ms.isolation_width = Convert.ToDouble(raw.GetTrailerExtraValue(id, idx.width));
            if (idx.pre >= 0) ms.precursor_scan = Convert.ToInt32(raw.GetTrailerExtraValue(id, idx.pre));
            if (ms.mz <= 0) ms.mz = ms.activation_center;
            return ms;
        }

        public void WriteMS1(MS ms, StreamWriter stream)
        {
            stream.Write(
                $"S\t{ms.id}\t{ms.id}\n" +
                $"I\tTotalIonCurrent\t{ms.total_ion_current:F4}\n" +
                $"I\tBasePeakIntensity\t{ms.base_peak_intensity:F4}\n" +
                $"I\tBasePeakMass\t{ms.base_peak_mass:F8}\n" +
                $"I\tScanMode\t{ms.scan_mode}\n" +
                $"I\tRetentionTime\t{ms.retention_time:F4}\n" +
                $"I\tIonInjectionTime\t{ms.injection_time:F4}\n" +
                $"I\tInstrumentType\t{ms.instrument_type}\n"
            );
            for (int i = 0; i < ms.masses.Length; i++)
                stream.Write($"{ms.masses[i]:F8} {ms.intensities[i]:F4}\n");
        }

        public void WriteMS2(MS ms, StreamWriter stream)
        {
            stream.Write(
                $"S\t{ms.id}\t{ms.id}\t{ms.activation_center:F8}\n" +
                $"I\tTotalIonCurrent\t{ms.total_ion_current:F4}\n" +
                $"I\tBasePeakIntensity\t{ms.base_peak_intensity:F4}\n" +
                $"I\tBasePeakMass\t{ms.base_peak_mass:F8}\n" +
                $"I\tScanMode\t{ms.scan_mode}\n" +
                $"I\tRetentionTime\t{ ms.retention_time:F4}\n" +
                $"I\tIonInjectionTime\t{ms.injection_time:F4}\n" +
                $"I\tInstrumentType\t{ms.instrument_type}\n" +
                $"I\tPrecursorScan\t{ms.precursor_scan}\n" +
                $"I\tActivationCenter\t{ms.activation_center:F8}\n" +
                $"I\tIsolationWidth\t{ms.isolation_width:F4}\n"
            );
            if (ms.z > 0)
                stream.Write($"Z\t{ms.z}\t{ms.mz * ms.z - MASS_PROTON * (ms.z - 1):F8}\n");
            else if (ms.z == 0)
                stream.Write($"Z\t{0}\t{0.0:F8}\n");
            else
                stream.Write($"Z\t{-ms.z}\t{ms.mz * -ms.z + MASS_PROTON * (-ms.z - 1):F8}\n");
            for (int i = 0; i < ms.masses.Length; i++)
                stream.Write($"{ms.masses[i]:F8} {ms.intensities[i]:F4}\n");
        }
    }

    class Program
    {
        public static int Main(string[] args)
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            if (args.Length != 2)
                Console.WriteLine("usage: ThermoRawRead FILE OUT");
            else
                new RawData(args[0], args[1]).Run();
            return 0;
        }
    }
}
