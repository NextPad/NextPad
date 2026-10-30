# Measure the buzzer

<aside class="np-kasten np-ziel" aria-label="What this is about">
<p class="np-kasten-titel">What this is about</p>

- run a buzzer measurement with several phones
- read the verdict of the measurement
- judge what the measurement does not show

</aside>

In a buzzer round, whoever presses first wins. The moment of the press counts. To do so every phone keeps setting its clock by the server. The measurement shows how much this clock sync varies on the Wi-Fi.

<figure class="np-film">
<video src="../medien/quiz-messen.mp4" poster="../medien/quiz-messen.png" muted loop playsinline controls preload="metadata"></video>
<figcaption>The measurement with three devices: the host sends signals, iPhone and Android phone press, a verdict follows.</figcaption>
</figure>

## Steps

1. Open **Buzzer measurement** from the quiz menu.
2. The measurement page has its own QR code. The phones open it with that code.
3. Tap **Measure** on every phone. At least three phones are needed.
4. The host sees how many phones are measuring. Keep the phones open for a few minutes.
5. Choose **Send signal** or press the space bar.
6. All phones show “Now – press!”. Everyone presses at once.
7. Each phone shows its own reaction time.
8. After 10 to 20 signals the **verdict** is in.
9. If needed, save **Raw data as CSV**. Then choose **Delete measurement data**.

## Reading the verdict

- “The clock sync holds”: in 95 % of cases the sync varies by less than 50 ms. That is enough. If two teams are closer than 50 ms, the game shows “tied” anyway.
- “The clock sync is not good enough”: the variation is larger. A different Wi-Fi may help.
- “Not enough data yet”: phones or time are missing.

Further values appear below the verdict. They do not enter the verdict. One of them is “Who was first?”. It shows in how many rounds the order by arrival at the server would have differed.

## Limits

- The measurement shows how much the sync varies. It does not show whether a clock is right.
- If the way through the Wi-Fi is persistently longer in one direction, this error stays invisible.
- Stored per device are a number, the rough device type and points in time. Names are not stored.
