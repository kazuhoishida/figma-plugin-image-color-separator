figma.showUI(__html__)

figma.ui.onmessage = async (msg: { type: string; color: string; sensitivity: number }) => {
  if (msg.type === "separate-color-channels") {
    const selection = figma.currentPage.selection[0] as SceneNode & { fills: readonly ImagePaint[] }

    if (selection.fills[0].type === "IMAGE") {
      await separateImageIntoColorChannels(selection, msg.color, msg.sensitivity)
    } else {
      figma.ui.postMessage({ type: "error", message: "Please select a Frame or Group containing an image." })
    }
  }
}

async function separateImageIntoColorChannels(node: SceneNode & { fills: readonly ImagePaint[] }, color: string, sensitivity: number) {
  const selectedImage = figma.getImageByHash(node.fills[0].imageHash ?? "")
  if (!selectedImage) return

  const bytes = await selectedImage.getBytesAsync()
  const newFills: ImagePaint[] = []

  // Create an invisible iframe to act as a "worker" which will do the task of decoding and send us a message when it's done.
  figma.showUI(__html__, { visible: false })

  // Send the raw bytes of the file to the worker.
  figma.ui.postMessage({ bytes, color, sensitivity })

  // Wait for the worker's response.
  const newBytes: Uint8Array = await new Promise<Uint8Array>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout: Did not receive a message from the UI within 5 seconds."))
    }, 5000)

    figma.ui.onmessage = (value) => {
      clearTimeout(timeout)
      resolve(value as Uint8Array)
    }
  }).catch((error) => {
    console.error(error)
    return new Uint8Array(0)
  })

  // Create a new paint for the new image
  const newPaint = JSON.parse(JSON.stringify(node.fills[0])) as ImagePaint & { imageHash: string }
  newPaint.imageHash = figma.createImage(newBytes).hash

  newFills.push(newPaint)

  // create new images from the new bytes
  const newNode = figma.createRectangle()
  const { width: imageWidth, height: imageHeight } = await selectedImage.getSizeAsync()
  newNode.resizeWithoutConstraints(imageWidth, imageHeight)
  newNode.fills = newFills

  // Resize the new node to fit the original image in the Figma document
  const scale = Math.min(node.width / imageWidth, node.height / imageHeight)
  newNode.resizeWithoutConstraints(imageWidth * scale, imageHeight * scale)

  // Position the new node next to the original image
  const offsetX = node.width + 100
  newNode.x = node.x + offsetX
  newNode.y = node.y

  figma.viewport.scrollAndZoomIntoView([newNode])
  figma.closePlugin()
}
