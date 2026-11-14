# Four quiet bugs in our booking flow, and what they taught us

*14 November 2026*

This week we brought back the file assessment for clients who book on their own. Clients a salesperson
sends skip it. Before shipping, we reviewed the booking, payment and sales paths line by line, looking
for bugs.

We were aiming for ten. We found four that were real. A fifth looked like a bug but wasn't, and we'll
come back to that at the end. We'd rather report four honest ones than pad the list.

None of the four crashed anything. Each one quietly did the wrong thing in a moment nobody tests by
hand.

---

## 1. One dropped request could leave a paying customer stuck forever

**Where:** the page clients return to after paying on EasyKash.

After paying, the client lands on a page that asks our server every few seconds, "is this booking paid
yet?" When the answer is yes, the plane animation lands and their ticket opens.

The problem was in how a failed request was handled. If one check failed, say on a weak mobile
connection, the error was turned into "no booking". "No booking" stopped the checking for good. The
client had paid, EasyKash had told our server, and the booking was confirmed. But this page had stopped
asking, so it showed the waiting animation forever. There was no ticket and no "this is taking longer
than usual" message.

**The fix:** a failed request is no longer treated as an answer. The page keeps what it already knows
and asks again on the next round. Only a real "this booking doesn't exist" stops the wait.

**The lesson:** "I couldn't find out" and "the answer is no" are different things. Mixing them up is
how a short network blip turns into a lost customer.

---

## 2. A booking saved at the review step could skip the assessment

**Where:** the booking form's final "Continue to payment" button.

The booking form saves the client's progress in their browser, so a reload doesn't lose their place.
The readiness check ran on the review step, but only if the saved progress already held the client's
answers.

So imagine a client who had reached the review step while the assessment was switched off, or whose
saved answers were lost. After this week's release, they press Continue to payment, and since there
are no answers to check, they go straight to paying without being assessed.

**The fix:** when a client who booked on their own reaches the review step without complete answers,
the form now sends them back to the questions.

**The lesson:** when you turn a required step back on, think about the people who are halfway through
the flow at that moment. Saved progress is old data, and old data doesn't know about the new rule.

---

## 3. The admin could overwrite their own rules without knowing

**Where:** Staff → Not ready → Rules.

On purpose, the booking form never gets stuck waiting for the readiness rules: if it can't load them,
it uses the default rules. That's right for clients.

But the admin's rules editor used the same loader. If loading failed, the admin saw the default
numbers as if they were the saved rules. Say the saved minimum tourism score was 45 and the default
is 60. The admin changes one checkbox and presses Save, and the minimum silently goes back to 60.
After that, clients who should pass are stopped.

**The fix:** the editor now asks for the rules "strictly". If they can't be loaded, it shows an error
instead of a form full of defaults, so there's nothing to save over the real rules.

**The lesson:** a fallback that is safe for reading can be dangerous for editing. Showing defaults in
a form is fine; saving them over real data is a quiet way to lose it.

---

## 4. Sales links erased the rest of the link

**Where:** the code that reads `?ref=` from a salesperson's link.

When a client opens a sales link, we remember the salesperson's code and then tidy the address bar.
The tidying removed everything after the address, not just `ref`. So a link like
`?ref=…&utm_source=facebook` lost its campaign tag, and a link to a booking page with its own settings
lost those settings too.

**The fix:** only `ref` is removed now. Everything else in the link stays.

**The lesson:** when you clean up a URL, remove only what you added or own, not everything.

---

## The one that wasn't a bug

We suspected that tapping Continue to payment twice could send the same "not ready" request to the
sales manager twice. We wrote a test for it, and the test passed on the old code. When you tap twice,
React applies the first tap's "sending" state before it handles the second tap, so the existing guard
was already enough. We undid that change and kept the test, so it stays protected.

Writing the test first is how we caught it. Without the test, we would have shipped a fix for a bug
that didn't exist.

---

## How we checked

Every fix has a test, and we ran each new test on the old code to make sure it fails there. The full
suite (341 tests) passes, and so does the type check.
