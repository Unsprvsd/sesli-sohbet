import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MAX_MESSAGE_LENGTH, type ChatMessage } from '../lobby'

type Props = {
  roomName: string
  messages: ChatMessage[]
  myName: string
  onSend: (text: string) => void
}

const URL_RE = /(https?:\/\/[^\s]+)/g

/** Turns http(s) links in the text into clickable links. */
function linkify(text: string) {
  // split() with a capture group: odd indexes are the links.
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  )
}

function time(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function Chat({ roomName, messages, myName, onSend }: Props) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // Jump to the newest message.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    onSend(text)
    setText('')
  }

  return (
    <section className="chat">
      <header className="chat-head"># {roomName}</header>
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && (
          <p className="hint">No messages yet. Be the first to write!</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="msg">
            <span className={`msg-name ${m.name === myName ? 'me' : ''}`}>{m.name}</span>
            <span className="msg-time">{time(m.ts)}</span>
            <div className="msg-text">{linkify(m.text)}</div>
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message #${roomName}`}
          maxLength={MAX_MESSAGE_LENGTH}
        />
        <button type="submit">Send</button>
      </form>
    </section>
  )
}
