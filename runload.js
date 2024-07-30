const fs = require('fs');
const path = require('path');


function load(url) {
	return new Promise((resolve, reject) => {
		fetch(url).then((response) => {
			return response.buffer();
		}).then((bufferr) => {
			resolve(buffer.toString('base64'));
		}).catch((err) => {
			console.log('reject ' + url);
			load(url);
		});
	});
}
let images = Array.from(new Array(90), (v, k) => {
	let number = String(k).padStart(4, "0");
	return `https://distracted-villani-e19534.netlify.app/train/rotation${number}.jpg`;
});
images.forEach(async function(url, i){
	try {
		let base64 = await load(url);
		let file = path.join(__dirname, 'docs', 'images', String(i).padStart(4, "0") + '.jpg');
		console.log(base64)
		await fs.writeFile(file, base64, 'base64');
	}catch(e){

	}
	//fs.writeFileSync(file, [await blob.arrayBuffer()]);
});
/*
load('https://distracted-villani-e19534.netlify.app/train/rotation0065.jpg').then((blob) => {
	console.log(blob);
}).catch((err) => {
	console.log(err);
})*/