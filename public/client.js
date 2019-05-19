(function(window, document, undefined){

    window.onload = init;

    function init(){
        
    }
    
    })(window, document, undefined);

function FindAction()
{
    GetRequest("http://localhost:8080/switchChannel",[],[],ExampleCallback)
    result = "kripparian"
    //get request to my server 
    //query select * from viewership order by time desc limit 10
    //sort data by remaining players
    //return username with least remaining players
    
}

function ExampleCallback(data)
{
    document.getElementById("tv").src = "https://player.twitch.tv/?channel="+data+"&muted=false&autoplay=true";
}

function GetRequest(url,qParams,qValues,callback)
{
    var req = new XMLHttpRequest();

    var reqStr = url + '?';

    if(qParams.length != qValues.length)
    {
        console.log("Invalid Get Request");
        return;
    }

    for (let index = 0; index < qParams.length; index++) {
        const param = qParams[index];
        const value = qValues[index];

        reqStr += param + '=' + value;
        
        if(index != qParams.length - 1)
            reqStr += '&';

    }
    req.open("GET",reqStr,true);
    req.send(null);

    req.onreadystatechange = function() {//async
        if(req.readyState == 4 && req.status == 200) 
        {
            var data = JSON.parse(req.responseText);
            
            if(data.cod == "404")
            {
                alert(data.message);
            }
            else
            {
                callback(data);
               
            }
            
        }
    }
}