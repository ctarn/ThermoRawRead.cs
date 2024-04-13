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
        public double[] masses = { };
        public double[] intensities = { };
        public double[] noises = { };

        // tandem
        public int precursor_scan = -1;
        public double activation_center = 0;
        public double isolation_width = 0;
        public double mz = 0;
        public int z = 0;

        // index
        public ulong index_mz = 0;
        public ulong index_inten = 0;
        public ulong index_noise = 0;
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

        public void Run(string fmt)
        {
            MS[] M = new MS[raw.RunHeaderEx.LastSpectrum - raw.RunHeaderEx.FirstSpectrum + 1];
            int last_ms1 = 0;
            for (int i = 0; i < M.Length; ++i)
            {
                if (i % 10000 == 0)
                    Console.WriteLine($"reading scan data ({i} / {raw.RunHeaderEx.LastSpectrum})");
                int id = raw.RunHeaderEx.FirstSpectrum + i;
                var ms = Read(id);
                if (ms.ms_order == MSOrderType.Ms)
                    last_ms1 = id;
                else if (ms.ms_order == MSOrderType.Ms2)
                    if (idx.pre < 0) ms.precursor_scan = last_ms1;
                M[i] = ms;
            }

            string path = Path.Combine(path_out, Path.GetFileNameWithoutExtension(path_in));
            if (!Directory.Exists(path_out)) Directory.CreateDirectory(path_out);

            string instrument = $"Thermo {raw.GetInstrumentData().Name}";
            double duration = raw.RunHeader.ExpectedRuntime * 60;
            string head = $"Instrument: {instrument}\n" + $"Duration: {duration}\n";

            if (fmt == "ums")
                RunUMS(path, M, head);
            else if (fmt == "mes")
                RunMES(path, M);
            else if (fmt == "msx")
                RunMSx(path, M);
            else
                Console.WriteLine($"unsupport output format: {fmt}");

            var meta = new StreamWriter(path + ".txt~", false);
            meta.Write(head);
            meta.Close();
            File.Delete(path + ".txt");
            File.Move(path + ".txt~", path + ".txt");
            Console.WriteLine($"meta data saved as {path}.txt");

            var stream_scan = File.Open(path + ".csv~", FileMode.Create);
            var writer_scan = new BinaryWriter(stream_scan);
            WriteScanList(writer_scan, M);
            writer_scan.Close();
            stream_scan.Close();
            File.Delete(path + ".csv");
            File.Move(path + ".csv~", path + ".csv");
            Console.WriteLine($"scan list saved as {path}.csv");

            raw.Dispose();
        }

        public void RunUMS(string path, MS[] M, string head = "")
        {
            var stream = File.Open(path + ".ums~", FileMode.Create);
            var writer = new BinaryWriter(stream);
            writer.Write("UMS\0\0\0\0\0".ToCharArray());
            writer.Write(Convert.ToUInt64(0)); // version
            var pos_index = stream.Position;
            writer.Write(Convert.ToUInt64(0)); // head offset
            writer.Write(Convert.ToUInt64(0)); // head length
            writer.Write(Convert.ToUInt64(0)); // meta offset
            writer.Write(Convert.ToUInt64(0)); // meta length
            writer.Write(Convert.ToUInt64(0)); // data offset
            writer.Write(Convert.ToUInt64(0)); // data length
            var pos_head_begin = stream.Position;
            writer.Write(head.ToCharArray());
            var pos_head_end = stream.Position;
            var pos_data_begin = stream.Position;
            for (int i = 0; i < M.Length; ++i)
            {
                if (i % 10000 == 0)
                    Console.WriteLine($"writing peak ({i} / {M.Length})");
                M[i].index_mz = (ulong)stream.Position;
                foreach (var x in M[i].masses)
                    writer.Write(Convert.ToDouble(x));
                M[i].index_inten = (ulong)stream.Position;
                foreach (var x in M[i].intensities)
                    writer.Write(Convert.ToDouble(x));
                M[i].index_noise = (ulong)stream.Position;
                foreach (var x in M[i].noises)
                    writer.Write(Convert.ToDouble(x));
            }
            var pos_data_end = stream.Position;
            var pos_meta_begin = stream.Position;
            WriteScanList(writer, M);
            var pos_meta_end = stream.Position;
            stream.Position = pos_index;
            writer.Write(Convert.ToUInt64(pos_head_begin));
            writer.Write(Convert.ToUInt64(pos_head_end - pos_head_begin));
            writer.Write(Convert.ToUInt64(pos_meta_begin));
            writer.Write(Convert.ToUInt64(pos_meta_end - pos_meta_begin));
            writer.Write(Convert.ToUInt64(pos_data_begin));
            writer.Write(Convert.ToUInt64(pos_data_end - pos_data_begin));
            stream.Close();
            writer.Close();
            File.Delete(path + ".ums");
            File.Move(path + ".ums~", path + ".ums");
            Console.WriteLine($"scan data saved as {path}.ums");
        }

        public void RunMES(string path, MS[] M)
        {
            var stream = File.Open(path + ".mes~", FileMode.Create);
            var writer = new BinaryWriter(stream);
            writer.Write("MES\n".ToCharArray());
            writer.Write(Convert.ToUInt32(0));
            writer.Write(Convert.ToUInt64(M.Length));
            for (int i = 0; i < M.Length; ++i)
            {
                if (i % 10000 == 0)
                    Console.WriteLine($"writing peak mass ({i} / {M.Length})");
                var ms = M[i];
                writer.Write(Convert.ToUInt64(ms.masses.Length));
                M[i].index_mz = (ulong)stream.Position;
                foreach (var x in ms.masses)
                    writer.Write(Convert.ToDouble(x));
            }
            for (int i = 0; i < M.Length; ++i)
            {
                if (i % 10000 == 0)
                    Console.WriteLine($"writing peak intensity ({i} / {M.Length})");
                var ms = M[i];
                writer.Write(Convert.ToUInt64(ms.intensities.Length));
                M[i].index_inten = (ulong)stream.Position;
                foreach (var x in ms.intensities)
                    writer.Write(Convert.ToDouble(x));
            }
            writer.Write(new string('\n', 8192).ToCharArray());
            WriteScanList(writer, M);
            stream.Close();
            writer.Close();
            File.Delete(path + ".mes");
            File.Move(path + ".mes~", path + ".mes");
            Console.WriteLine($"scan data saved as {path}.mes");
        }

        public void RunMSx(string path, MS[] M)
        {
            var ms1 = new StreamWriter(path + ".ms1~", false);
            var ms2 = new StreamWriter(path + ".ms2~", false);
            for (int i = 0; i < M.Length; ++i)
            {
                if (i % 10000 == 0)
                    Console.WriteLine($"writing scan data ({i} / {M.Length})");
                var ms = M[i];
                if (ms.ms_order == MSOrderType.Ms)
                    WriteMS1(ms, ms1);
                else if (ms.ms_order == MSOrderType.Ms2)
                    WriteMS2(ms, ms2);
            }
            ms1.Close();
            ms2.Close();
            File.Delete(path + ".ms1");
            File.Delete(path + ".ms2");
            File.Move(path + ".ms1~", path + ".ms1");
            Console.WriteLine($"MS1 data saved as {path}.ms1");
            File.Move(path + ".ms2~", path + ".ms2");
            Console.WriteLine($"MS2 data saved as {path}.ms2");
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
                ms.noises = scan.CentroidScan.Noises;
            }
            else
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

        public void WriteScanList(BinaryWriter io, MS[] M)
        {
            io.Write((
                "ScanType,ScanID,ScanMode,TotalIonCurrent,BasePeakIntensity,BasePeakMass" +
                ",RetentionTime,IonInjectionTime,InstrumentType" +
                ",PrecursorScan,ActivationCenter,IsolationWidth,PrecursorMZ,PrecursorCharge" +
                ",_MassPosition,_MassLength,_IntensityPosition,_IntensityLength,_NoisePosition,_NoiseLength" +
                "\n").ToCharArray()
            );
            foreach (var ms in M)
            {
                if (ms.ms_order == MSOrderType.Ms)
                {
                    io.Write((
                        $"MS1,{ms.id},{ms.scan_mode},{ms.total_ion_current:F4},{ms.base_peak_intensity:F4},{ms.base_peak_mass:F8}" +
                        $",{ms.retention_time:F4},{ms.injection_time:F4},{ms.instrument_type}" +
                        $",0,0.0,0.0,0.0,0" +
                        $",{ms.index_mz},{ms.masses.Length * 8},{ms.index_inten},{ms.intensities.Length * 8},{ms.index_noise},{ms.noises.Length * 8}" +
                        "\n").ToCharArray()
                    );
                }
                else if (ms.ms_order == MSOrderType.Ms2)
                {
                    io.Write((
                        $"MS2,{ms.id},{ms.scan_mode},{ms.total_ion_current:F4},{ms.base_peak_intensity:F4},{ms.base_peak_mass:F8}" +
                        $",{ms.retention_time:F4},{ms.injection_time:F4},{ms.instrument_type}" +
                        $",{ms.precursor_scan},{ms.activation_center:F8},{ms.isolation_width:F4},{ms.mz:F8},{ms.z}" +
                        $",{ms.index_mz},{ms.masses.Length * 8},{ms.index_inten},{ms.intensities.Length * 8},{ms.index_noise},{ms.noises.Length * 8}" +
                        "\n").ToCharArray()
                    );
                }
            }
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
            if (args.Length == 2)
                new RawData(args[0], args[1]).Run("ums");
            else if (args.Length == 3)
                new RawData(args[1], args[2]).Run(args[0]);
            else
                Console.WriteLine("usage: ThermoRawRead [format: ums|mes|msx] input_path output_dir");
            return 0;
        }
    }
}
