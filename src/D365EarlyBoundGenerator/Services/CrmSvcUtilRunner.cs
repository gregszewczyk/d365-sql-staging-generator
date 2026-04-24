using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using D365EarlyBoundGenerator.Config;
using D365SqlStagingGenerator.Shared;

namespace D365EarlyBoundGenerator.Services;

public sealed class CrmSvcUtilRunner
{
    private readonly AppConfig _config;

    public CrmSvcUtilRunner(AppConfig config)
    {
        _config = config;
    }

    public int Run()
    {
        var exe = ResolveExecutable();
        Console.WriteLine($"Using CrmSvcUtil at: {exe}");

        Directory.CreateDirectory(_config.Output.Directory);
        var outFile = Path.Combine(_config.Output.Directory, _config.Output.FileName);

        var args = BuildArguments(outFile);

        // .exe is a .NET Framework assembly; on non-Windows it must run via mono.
        string fileName;
        string arguments;

        var needsMono = !RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
        if (needsMono)
        {
            var mono = string.IsNullOrWhiteSpace(_config.CrmSvcUtil.MonoPath) ? "mono" : _config.CrmSvcUtil.MonoPath;
            fileName = mono;
            arguments = $"\"{exe}\" {args}";
        }
        else
        {
            fileName = exe;
            arguments = args;
        }

        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(exe)!
        };

        Console.WriteLine($"Invoking: {fileName} {RedactArgs(arguments)}");
        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException("Failed to start CrmSvcUtil.");

        process.OutputDataReceived += (_, e) => { if (e.Data is not null) Console.WriteLine(e.Data); };
        process.ErrorDataReceived  += (_, e) => { if (e.Data is not null) Console.Error.WriteLine(e.Data); };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        process.WaitForExit();

        if (process.ExitCode == 0)
            Console.WriteLine($"Generated -> {outFile}");

        return process.ExitCode;
    }

    private string BuildArguments(string outFile)
    {
        var connectionString = DataverseConnectionStringBuilder.Build(_config.Dataverse, requireNewInstance: false);

        var args = new List<string>
        {
            $"/connectionstring:\"{connectionString}\"",
            $"/out:\"{outFile}\"",
            $"/namespace:{_config.Output.Namespace}"
        };

        if (_config.Entities.Count > 0)
            args.Add($"/entitynamesfilter:\"{string.Join(";", _config.Entities)}\"");

        if (!string.IsNullOrWhiteSpace(_config.Output.ServiceContextName))
            args.Add($"/serviceContextName:{_config.Output.ServiceContextName}");

        if (_config.Output.GenerateActions)
            args.Add("/generateActions");

        return string.Join(" ", args);
    }

    private string ResolveExecutable()
    {
        if (!string.IsNullOrWhiteSpace(_config.CrmSvcUtil.ExecutablePath))
        {
            if (!File.Exists(_config.CrmSvcUtil.ExecutablePath))
                throw new FileNotFoundException($"CrmSvcUtil not found at configured path: {_config.CrmSvcUtil.ExecutablePath}");
            return _config.CrmSvcUtil.ExecutablePath;
        }

        var asmDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
        var candidate = Path.Combine(asmDir, "crmsvcutil", "CrmSvcUtil.exe");
        if (File.Exists(candidate)) return candidate;

        throw new FileNotFoundException(
            $"CrmSvcUtil.exe not found at {candidate}. " +
            "Rebuild the project (the CopyCrmSvcUtil MSBuild target copies it from the Microsoft.CrmSdk.CoreTools package), " +
            "or set CrmSvcUtil:ExecutablePath in appsettings.json to point at your own copy.");
    }

    private static string RedactArgs(string args)
    {
        // Hide client secret when logging the invocation.
        var idx = args.IndexOf("ClientSecret=", StringComparison.OrdinalIgnoreCase);
        if (idx < 0) return args;
        var end = args.IndexOf(';', idx);
        if (end < 0) end = args.Length;
        return args[..idx] + "ClientSecret=***REDACTED***" + args[end..];
    }
}
