@echo off
REM ============================================================
REM Atualiza os precos das cartas rodando do seu proprio PC.
REM Motivo: a Liga Pokemon bloqueia (via Cloudflare) os IPs de
REM datacenter do GitHub Actions, entao o robo so funciona a
REM partir de um IP residencial normal, como o de casa/trabalho.
REM ============================================================
setlocal

cd /d "%~dp0.."

echo [1/4] Instalando/atualizando dependencias Python...
pip install -r scripts\requirements.txt

echo [2/4] Instalando Chromium do Playwright (so baixa se ja nao tiver)...
python -m playwright install chromium

echo [3/4] Rodando update_prices.py...
python scripts\update_prices.py

echo [4/4] Se apareceram mudancas acima, confira com "git status",
echo       depois faca commit e push pelo GitHub Desktop normalmente.
echo       (Este script NAO comita nem da push sozinho.)

pause
