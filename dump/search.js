const fs = require('fs');

let query = 'microplastics !gos';

async function fetchData() {
  try {
    const response = await fetch(`https://searxng-production-eef8.up.railway.app/?q=${query}&format=json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log('Fetched data:', data);

    // Filter results to only include specified fields
    const filteredResults = data.results.map(result => {
      return {
        title: result.title || '',
        content: result.content || '',
        url: result.url || '',
        pdf_url: result.pdf_url || '',
        html_url: result.html_url || ''
      };
    });

    // Create a new object with filtered results and other metadata
    const filteredData = {
      query: data.query,
      number_of_results: data.number_of_results,
      results: filteredResults
    };

    // Convert object to JSON string
    const content = JSON.stringify(filteredData, null, 2);

    fs.writeFile('output.json', content, 'utf8', (err) => {
      if (err) {
        console.error('Error writing file:', err);
      } else {
        console.log('Filtered data written to file successfully!');
        console.log(`Total results: ${filteredResults.length}`);
      }
    });
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

fetchData();