let salesTable = document.getElementById('sales-table');
let taxRate = 0;
let symbol = '';

fetch("http://localhost:8001/api/settings/get")
.then(res=>res.json())
.then(data=>{
    console.log(data.settings)
    taxRate+=parseFloat(data.settings.percentage)/100
    symbol+=data.settings.symbol
})

function renderSale(sale){
    let subtotal = 0;
    sale.items.forEach(item=>{
        let quantity = Math.round(item.quantity/2);
        subtotal+=item.price*quantity;
    })
    
    let date = new Date(sale.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        timeZone: 'UTC'
        })
    let saleRow = `<tr>
        <td>${sale.order}</td>
        <td>${sale.items.map(item=>`<p>${Math.round(item.quantity/2)} ${item.product_name}</p>`)}</td>
        <td>${symbol}${subtotal}</td>
        <td>${symbol}${subtotal*taxRate}</td>
        <td>${symbol}${subtotal+subtotal*taxRate}</td>
        <td>${sale.payment_type}</td>
        <td>${sale.till}</td>
        <td>${sale.user}</td>
        <td>${date}</td>
    </tr>`
    return saleRow;
}

fetch("http://localhost:8001/selling")
.then(res=>res.json())
.then(data=>{
    data.forEach(sale => salesTable.innerHTML+=renderSale(sale));
})
