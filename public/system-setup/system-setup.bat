@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "LOGFILE=%~dp0install_deps.log"
echo Installer starting. Press any key to continue...
pause >nul
echo ===== Run started %date% %time% =====>"%LOGFILE%"

set "EXIT_CODE=0"
set "PACKAGES=pygame djitellopy matplotlib numpy pandas"
set "PY_INSTALLER_URL=https://www.python.org/ftp/python/3.12.2/python-3.12.2-amd64.exe"
set "PY_INSTALLER=%TEMP%\py_installer.exe"

call :log "Checking for Python..."
set "PYCMD="
where py >nul 2>nul
if not errorlevel 1 set "PYCMD=py -3"
if not defined PYCMD (
  where python >nul 2>nul
  if not errorlevel 1 set "PYCMD=python"
)

if not defined PYCMD (
  call :log "Python not found. Downloading and installing Python 3.12.2 (includes pip)..."
  powershell -NoLogo -NoProfile -Command "Invoke-WebRequest -Uri '%PY_INSTALLER_URL%' -OutFile '%PY_INSTALLER%'" || set "EXIT_CODE=1"
  if not exist "%PY_INSTALLER%" (
    call :log "Failed to download Python installer. Check your internet connection."
    set "EXIT_CODE=1"
    goto :show_messages
  )
  if "%EXIT_CODE%"=="0" "%PY_INSTALLER%" /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_test=0 SimpleInstall=1 || set "EXIT_CODE=1"
  del "%PY_INSTALLER%" 2>nul
  if "%EXIT_CODE%"=="0" (
    call :log "Re-checking Python..."
    set "PYCMD="
    where py >nul 2>nul
    if not errorlevel 1 set "PYCMD=py -3"
    if not defined PYCMD (
      where python >nul 2>nul
      if not errorlevel 1 set "PYCMD=python"
    )
    if not defined PYCMD (
      call :log "Python installation failed or PATH not updated. Reopen this window and try again."
      set "EXIT_CODE=1"
      goto :show_messages
    )
  ) else (
    call :log "Python installer reported an error."
    goto :show_messages
  )
)

call :log "Ensuring pip is available..."
%PYCMD% -m ensurepip --upgrade || set "EXIT_CODE=1"

call :log "Upgrading pip..."
%PYCMD% -m pip install --upgrade pip || set "EXIT_CODE=1"

call :log "Installing required packages: %PACKAGES% ..."
%PYCMD% -m pip install --upgrade %PACKAGES% || set "EXIT_CODE=1"

:show_messages
if "%EXIT_CODE%"=="0" (
  call :log "SUCCESS: Dependencies installed."
) else (
  call :log "Finished with errors. Review messages above and in %LOGFILE%."
)
call :log "Log saved to %LOGFILE%"
echo.
echo Keeping this window open. Close it manually when done reading (or press Ctrl+C).
:wait
timeout /t 86400 >nul
goto :wait

:log
echo %~1
echo %~1>>"%LOGFILE%"
exit /b 0
