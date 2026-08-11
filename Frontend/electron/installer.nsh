!macro customInstall
  CreateShortCut "$SMSTARTUP\EduSync.lnk" "$INSTDIR\EduSync.exe"
!macroend

!macro customUnInstall
  Delete "$SMSTARTUP\EduSync.lnk"
!macroend
