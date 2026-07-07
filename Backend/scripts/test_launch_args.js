const puppeteer = require('D:/Projects_WebDev/EduSync/Frontend/node_modules/puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const run = async () => {
  const pairs = [
    ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    ['--use-fake-ui-for-media-stream', '--auto-accept-camera-and-microphone-capture'],
    ['--use-fake-device-for-media-stream', '--auto-accept-camera-and-microphone-capture']
  ];

  for (const pair of pairs) {
    try {
      console.log(`Testing pair: ${pair.join(' and ')}`);
      const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', ...pair]
      });
      console.log(`Success with pair: ${pair.join(' and ')}`);
      await browser.close();
    } catch (err) {
      console.error(`Failed with pair: ${pair.join(' and ')}. Error: ${err.message}`);
    }
  }
};

run();
