/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import type { EditorNodePropertyDef } from 'node-red'
import { type Method, methods } from './utils'

interface WithEditor {
  editor?: AceAjax.Editor
}

const defaults = {
  name: { value: '' },
  clientId: { value: '' },
  secret: { value: '' },
  server: { value: '' },
  path: { value: '' },
  method: { value: methods[0] },
} satisfies {
  clientId: EditorNodePropertyDef<string>
  secret: EditorNodePropertyDef<string>
  name: EditorNodePropertyDef<string>
  server: EditorNodePropertyDef<string>
  path: EditorNodePropertyDef<string>
  method: EditorNodePropertyDef<Method>
}

RED.nodes.registerType('tuyapi', {
  category: 'network',
  color: '#ff9166',
  defaults,
  inputs: 1,
  outputs: 1,
  label: function () {
    return this.name || 'tuyapi'
  },
  icon: 'icons/tuyapi.svg',
  oneditprepare: function () {
    const node = this as typeof this & WithEditor
    const input = document.querySelector('#node-headers-input')
    node.editor = RED.editor.createEditor({
      id: 'node-headers-editor',
      mode: 'ace/mode/text',
      value: input && input instanceof HTMLInputElement ? input.value : '',
    })
  },
  oneditsave: function () {
    const input = document.querySelector('#node-headers-input')
    const node = this as typeof this & WithEditor
    const editorValue = node.editor?.getValue()

    if (input && input instanceof HTMLInputElement && editorValue) {
      input.value = editorValue
    }
    node.editor?.destroy()
    delete node.editor
  },
  oneditcancel: function () {
    const node = this as typeof this & WithEditor
    node.editor?.destroy()
    delete node.editor
  },
})
