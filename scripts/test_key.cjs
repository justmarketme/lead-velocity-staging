
const https = require('https');

const url = 'https://cmsylaupctrbsvzrgzwy.supabase.co/rest/v1/';
const apikey = 'AIzaSyCTZqGgjr9bvoE38GUOB1vQfkDcbinIJjE';

const options = {
    headers: {
        'apikey': apikey,
        'Authorization': `Bearer ${apikey}`
    }
};

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Body:', data);
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
