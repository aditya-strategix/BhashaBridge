$schemaPath = 'e:\BhashaBridge\BhashaBridge\backend\prisma\schema.prisma'
$content = Get-Content $schemaPath -Raw
$content = $content -replace 'preferredLanguage String       @default\("en"\)', "preferredLanguage String       @default("en")
    avatar            String?      @db.Text"
Set-Content -Path $schemaPath -Value $content
