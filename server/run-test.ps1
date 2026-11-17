#!/usr/bin/env pwsh
$env:DATABASE_URL = "file:.\dev.db"
& "C:\Program Files\nodejs\node.exe" --test "src/assessments/assembler.test.ts"