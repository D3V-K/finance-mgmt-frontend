import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from './Dialog'

function Example() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  return <><button onClick={() => setOpen(true)}>Open form</button><Dialog open={open} title="Example" onClose={() => setOpen(false)}><input aria-label="Name" value={value} onChange={(event) => setValue(event.target.value)} /><button onClick={() => setOpen(false)}>Save</button></Dialog></>
}

it('traps keyboard focus, preserves input focus on rerenders, and restores the trigger', async () => {
  const user = userEvent.setup()
  render(<Example />)
  const trigger = screen.getByRole('button', { name: 'Open form' })
  await user.click(trigger)
  expect(screen.getByRole('dialog')).toHaveFocus()
  await user.tab()
  expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
  await user.tab({ shift: true })
  expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
  await user.tab()
  expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
  await user.tab()
  const input = screen.getByRole('textbox', { name: 'Name' })
  expect(input).toHaveFocus()
  await user.keyboard('Alice')
  expect(input).toHaveValue('Alice')
  expect(input).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
