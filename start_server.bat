@echo off
:: Kursun kompüterində bu faylı sağ klik edib "Düzenle" (Edit) seçin
:: "YOUR_DOMAIN" yazısını öz pulsuz Ngrok domeninizlə əvəzləyin (məs: muhtesem-3lu.ngrok-free.app)

cd /d "%~dp0"
start /b node server.js
ping 127.0.0.1 -n 6 >nul
start /b ngrok http 3000 --domain=appulsively-postencephalitic-exie.ngrok-free.dev
