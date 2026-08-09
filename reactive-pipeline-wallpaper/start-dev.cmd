@echo off
cd /d "%~dp0"
npm.cmd install
start "" http://127.0.0.1:5192/
npm.cmd run dev

