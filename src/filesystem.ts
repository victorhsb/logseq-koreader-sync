import '@logseq/libs'

/** Used to find all of the KOReader metadata files in a directory and its subdirectories */
export async function* walkDirectory(directoryHandle: any) {
  if (directoryHandle.kind === "file") {
    const file = await directoryHandle.getFile()
    if (file !== null && file.name.toLowerCase().endsWith('.lua') && file.name.toLowerCase().includes('metadata')) {
      yield file
    }
  } else if (directoryHandle.kind === "directory") {
    for await (const handle of directoryHandle.values()) {
      yield* walkDirectory(handle)
    }
  }
}

export async function getMetadataFiles(directoryHandle: any): Promise<File[]> {
  const files: File[] = []
  for await (const file of walkDirectory(directoryHandle)) {
    files.push(file)
  }
  return files
}

// https://developer.chrome.com/docs/capabilities/web-apis/file-system-access#stored_file_or_directory_handles_and_permissions
export async function verifyPermission(fileHandle: any) {
  if ((await fileHandle.queryPermission({})) === 'granted') {
    return true
  }
  if ((await fileHandle.requestPermission({})) === 'granted') {
    return true
  }
  return false
}

declare global {
  interface Window {
    showDirectoryPicker: any
  }
}
