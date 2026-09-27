import React, { useState } from 'react';

const types = [
  'General feedback',
  'Product feedback',
  'Order feedback',
  'Delivery feedback',
  'Payment issue',
  'Complaint',
  'Bug report',
  'Feature request'
];

export default function FeedbackCenter() {
  const [type, setType] = useState(types[0]);
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function submitFeedback(event) {
    event.preventDefault();

    const feedback = {
      id: crypto.randomUUID(),
      type,
      rating,
      message: message.trim(),
      created_at: new Date().toISOString()
    };

    const existing = JSON.parse(
      localStorage.getItem('brukina_feedback') || '[]'
    );

    localStorage.setItem(
      'brukina_feedback',
      JSON.stringify([feedback, ...existing])
    );

    setMessage('');
    setSent(true);
  }

  return (
    <section className="feedback-center">
      <h2>Feedback Center</h2>
      <p>Send feedback, report an issue, or suggest an improvement.</p>

      <form onSubmit={submitFeedback}>
        <label>
          Feedback type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        <label>
          Rating
          <select
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
          >
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {'★'.repeat(value)} ({value}/5)
              </option>
            ))}
          </select>
        </label>

        <label>
          Message
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what happened or what you would like improved..."
            rows={5}
            required
          />
        </label>

        <button type="submit">Submit Feedback</button>

        {sent && (
          <p role="status">
            Feedback submitted successfully.
          </p>
        )}
      </form>
    </section>
  );
}
