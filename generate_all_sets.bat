@echo off
REM Gera card data para todos os sets SV (2023-2025)
REM Rode este arquivo na pasta do projeto: generate_all_sets.bat

set USD=5.80

echo === MyDeck Set Generator ===
echo USD/BRL: %USD%
echo.

echo [2023]
node generate_set.js sv1 %USD%
node generate_set.js sv2 %USD%
node generate_set.js sv3 %USD%
node generate_set.js sv3pt5 %USD%
node generate_set.js sv4 %USD%

echo.
echo [2024]
node generate_set.js sv4pt5 %USD%
node generate_set.js sv5 %USD%
node generate_set.js sv6 %USD%
node generate_set.js sv6pt5 %USD%
node generate_set.js sv7 %USD%
node generate_set.js sv8 %USD%

echo.
echo [2025]
node generate_set.js sv8pt5 %USD%
node generate_set.js sv9 %USD%
node generate_set.js sv10 %USD%

echo.
echo === Concluido! ===
echo Arquivos gerados: cards_sv*.js
echo Adicione-os ao app.js e index.html
pause
