!macro NSIS_HOOK_POSTINSTALL
  # Copy all DLL files from the resources subdirectory to the root installation folder
  CopyFiles "$INSTDIR\resources\*.dll" "$INSTDIR"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  # Clean up the copied DLL files from the root installation folder
  Delete "$INSTDIR\*.dll"
!macroend
