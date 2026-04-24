using D365EarlyBoundGenerator.Config;
using D365EarlyBoundGenerator.Services;
using Microsoft.Extensions.Configuration;

namespace D365EarlyBoundGenerator;

public static class Program
{
    public static int Main(string[] args)
    {
        try
        {
            var configPath = args.Length > 0 ? args[0] : "appsettings.json";

            var configuration = new ConfigurationBuilder()
                .SetBasePath(Directory.GetCurrentDirectory())
                .AddJsonFile(configPath, optional: false, reloadOnChange: false)
                .AddJsonFile("appsettings.local.json", optional: true, reloadOnChange: false)
                .AddEnvironmentVariables("D365EBG_")
                .Build();

            var appConfig = configuration.Get<AppConfig>() ?? new AppConfig();

            if (appConfig.Entities.Count == 0)
            {
                Console.Error.WriteLine(
                    "No entities configured. Add entity logical names to the 'Entities' array in appsettings.json. " +
                    "Leave empty only if you deliberately want all entities (slow).");
                return 1;
            }

            appConfig.Dataverse.Validate();

            Console.WriteLine($"Generating early-bound classes for {appConfig.Entities.Count} entity/entities from {appConfig.Dataverse.Url}");

            var runner = new CrmSvcUtilRunner(appConfig);
            return runner.Run();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Fatal error: {ex.Message}");
            Console.Error.WriteLine(ex.ToString());
            return 1;
        }
    }
}
