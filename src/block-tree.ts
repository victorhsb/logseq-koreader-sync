import '@logseq/libs'
import { IBatchBlock } from '@logseq/libs/dist/LSPlugin'

interface InsertOptions {
  sibling?: boolean
  before?: boolean
}

export async function insertBlockTree(
  parentUuid: string,
  block: IBatchBlock,
  options: InsertOptions = {}
) {
  const inserted = await logseq.Editor.insertBlock(parentUuid, block.content, {
    sibling: options.sibling ?? false,
    before: options.before,
    properties: block.properties,
  })

  if (inserted && block.children && block.children.length > 0) {
    for (const child of block.children) {
      await insertBlockTree(inserted.uuid, child)
    }
  }

  return inserted
}
