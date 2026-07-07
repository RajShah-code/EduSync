const puppeteer = require('D:/Projects_WebDev/EduSync/Frontend/node_modules/puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const run = async () => {
  const modes = [
    { headless: true },
    { headless: 'shell' },
    { headless: false }
  ];

  for (const mode of modes) {
    try {
      console.log(`Trying mode: ${JSON.stringify(mode)}`);
      const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        ...mode,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      console.log(`Success with mode: ${JSON.stringify(mode)}`);
      await browser.close();
      process.exit(0);
    } catch (err) {
      console.error(`Failed with mode: ${JSON.stringify(mode)}. Error: ${err.message}`);
    }
  }
  process.exit(1);
};

run();
