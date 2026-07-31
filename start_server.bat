@echo off
:: Kursun kompüterində bu faylı sağ klik edib "Düzenle" (Edit) seçin
:: "YOUR_DOMAIN" yazısını öz pulsuz Ngrok domeninizlə əvəzləyin (məs: muhtesem-3lu.ngrok-free.app)

cd /d "%~dp0"
start /b node server.js
timeout /t 5 >nul
start /b ngrok http 3000 --domain=YOUR_DOMAIN
