const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const app = express();
const port = 3000;

// Function to perform web scraping
async function searchForUser(username, last_n_tweets = 20) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
    );
    await page.goto(`https://nitter.space/${username}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.timeline-item');
    
    const scrollToBottomAndCountItems = async () => {
      let itemCount = 0;
      let previousHeight;
      const maxAttemptsAtBottom = 3;
      let attempts = maxAttemptsAtBottom;
      const checkInterval = 1000;

      while (attempts > 0) {
        previousHeight = await page.evaluate('document.body.scrollHeight');
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        
        itemCount = await page.$$eval('.timeline-item', (items) => items.length);
        if (itemCount >= last_n_tweets) return false;

        const currentHeight = await page.evaluate('document.body.scrollHeight');
        if (currentHeight === previousHeight) attempts--;
        else attempts = maxAttemptsAtBottom;
      }
      return true;
    };

    while (await scrollToBottomAndCountItems()) {}

    await page.waitForSelector('.timeline-item');

    const timelineDetails = await page.$$eval('.timeline-item', (items, N) => 
      items.slice(0, N).map((item) => {
        const tweetLink = item.querySelector('.tweet-link')?.href || '';
        const tweetContent = item.querySelector('.tweet-content')?.innerText.trim() || '';
    
        const tweetDateElem = item.querySelector('.tweet-date a');
        const tweetDate = tweetDateElem ? tweetDateElem.getAttribute('title') : '';
    
        const quoteText = item.querySelector('.quote-text')?.innerText.trim() || '';
        const quoteLink = item.querySelector('.quote-link')?.href || '';
    
        const imageUrls = Array.from(item.querySelectorAll('.gallery-row .attachment img')).map(img => img.src) || [];
        const videoUrls = Array.from(item.querySelectorAll('.gallery-video video source')).map(video => video.src) || [];
    
        const getStats = (selector) => item.querySelector(selector)?.innerText.trim() || '0';
    
        const retweets = item.querySelector('.icon-retweet') ? getStats('.icon-retweet') : '0';
        const comments = item.querySelector('.icon-comment') ? getStats('.icon-comment') : '0';
        const quotes = item.querySelector('.icon-quote') ? getStats('.icon-quote') : '0';
        const likes = item.querySelector('.icon-heart') ? getStats('.icon-heart') : '0';
    
        return {
          tweetDate,
          tweetLink,
          tweetContent,
          quoteText,
          quoteLink,
          imageUrls,
          videoUrls,
          retweets,
          comments,
          quotes,
          likes,
        };
      })
    , last_n_tweets);

    return timelineDetails;
  } catch (error) {
    console.error('Error occurred:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Create an Express route
app.get('/scrape/:username/:count', async (req, res) => {
  const { username, count } = req.params;
  const numTweets = parseInt(count, 10);

  if (!username || !numTweets) {
    return res.status(400).send('Invalid parameters');
  }

  try {
    const data = await searchForUser(username, numTweets);
    res.json(data);
  } catch (error) {
    res.status(500).send('An error occurred during scraping');
  }
});


app.listen(3000, '0.0.0.0', function() {
  console.log('Listening to port:  ' + 3000);
});