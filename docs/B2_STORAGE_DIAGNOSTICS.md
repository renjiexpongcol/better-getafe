# Backblaze B2 storage diagnostics

Run the application diagnostic from the repository root. It reads the configured endpoint, region, bucket, and credentials without printing credential values:

```powershell
npm run diagnose:b2
```

To also verify upload, metadata, download, deletion, and confirmed deletion of a uniquely named `health-tests/` object, run:

```powershell
npm run diagnose:b2 -- --lifecycle
```

The lifecycle check attempts cleanup even if an operation fails. It requires the configured application key to have the corresponding bucket-scoped read, write, and delete capabilities.

To inspect network connectivity independently of S3 authentication, set the endpoint to the configured bucket's actual regional S3 endpoint and run:

```powershell
$endpoint = 'https://s3.<actual-region>.backblazeb2.com'
$hostname = ([uri]$endpoint).DnsSafeHost
Resolve-DnsName $hostname
Test-NetConnection $hostname -Port 443
curl.exe -I --max-time 15 $endpoint
```

An HTTP 400, 403, or 405 response from the unsigned `curl.exe` request still confirms that an HTTPS response was received. It does not validate S3 credentials or bucket permissions.
