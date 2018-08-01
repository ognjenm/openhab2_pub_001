'use strict';
load('/etc/openhab2/automation/jsr223/00_jslib/JSRule.js');

var AtHomeSTimer = null;
var AtHomeJTimer = null;

var gLatencyTriggers = []
itemRegistry.getItem("gLatency").getMembers().forEach(function (gLatencyItem) 
{
    gLatencyTriggers.push(ItemStateChangeTrigger(gLatencyItem.name));
});

JSRule({
    name: "latencyupdates",
    description: "Line: "+__LINE__,
    triggers: gLatencyTriggers,
    execute: function( module, input){
        var triggeringItem = getItem(getTriggeringItemStr(input));
        var toUpdate = triggeringItem.name.split("Latency")[0]
        var itemLatency = triggeringItem
        var itemPresence = getItem(toUpdate + "Presence");
        var itemOnline = getItem(toUpdate + "Online");

        var out, online, pinglatency;

        if ((itemOnline.state == OPEN) || (itemOnline.state === undefined)) online = "ONLINE"
        else online = "OFFLINE"

        if ((itemLatency.state != "") && (!isUninitialized(itemLatency)))
        {
            online = "ONLINE"
            pinglatency = Math.round( itemLatency.state ) + " ms"
        }
        else
        {
            online = "OFFLINE"
            pinglatency = ""
        }

        out = online +" "+ pinglatency
        postUpdate(itemPresence,out)
        //logInfo(toUpdate +": "+ out);

        if ((toUpdate == "HandyS") && (AtHomeSTimer === null))
        {
            var itemAtHomeS = getItem("AtHomeS");
            if ((itemAtHomeS.state != ON) && (online == "ONLINE")) postUpdate(itemAtHomeS,ON)
            else if ((itemAtHomeS.state != OFF) && (online == "OFFLINE"))
            {
                AtHomeSTimer = createTimer(now().plusSeconds(5*60), function() 
                {
                    var itemAtHomeS = getItem("AtHomeS");
                    var itemOnline = getItem("HandySOnline");
                    if (itemOnline.state == CLOSED) postUpdate(itemAtHomeS,OFF)
                    AtHomeSTimer = null;
                });
            }
        }
        else if ((toUpdate == "HandyJ") && (AtHomeJTimer === null))
        {
            var itemAtHomeJ = getItem("AtHomeJ");
            if ((itemAtHomeJ.state != ON) && (online == "ONLINE")) postUpdate(itemAtHomeJ,ON)
            else if ((itemAtHomeJ.state != OFF) && (online == "OFFLINE"))
            {
                AtHomeJTimer = createTimer(now().plusSeconds(5*60), function() 
                {
                    var itemAtHomeJ = getItem("AtHomeJ");
                    var itemOnline = getItem("HandyJOnline");
                    if (itemOnline.state == CLOSED) postUpdate(itemAtHomeJ,OFF)
                    AtHomeJTimer = null;
                });
            }
        }
    }
});

var gAtHomeTriggers = [];
itemRegistry.getItem("gAtHome").getMembers().forEach(function (gAtHomeItem) 
{
    gAtHomeTriggers.push(ItemStateChangeTrigger(gAtHomeItem.name));
});

JSRule({
    name: "presence logic",
    description: "Line: "+__LINE__,
    triggers: gAtHomeTriggers,
    execute: function( module, input)
    {
        var itemSysStartup = getItem("SysStartup");
        if (itemSysStartup.state!=ON)
        {
            var itemAtHome = getItem(getTriggeringItemStr(input));
            var id = itemAtHome.name.split("AtHome")[1];
            var name;
            if (id == "S") name = "XXXXXXX1";
            if (id == "J") name = "XXXXXXX2";
            var itemfboxMissedCalls = getItem("fboxMissedCalls");

            var itemAtHomeBegin = getItem("AtHome"+id+"Begin");
            var itemAtHomeEnd = getItem("AtHome"+id+"End");
            var itemTTSOut2 = getItem("TTSOut2");

            var MissedCalls = ""
            if (itemfboxMissedCalls.state > 0)
            {
                MissedCalls = "Es gibt "
                if (itemfboxMissedCalls.state == 1)
                {
                    MissedCalls += "einen verpassten Anruf. "
                }
                else
                {
                    MissedCalls += itemfboxMissedCalls.state + " verpasste Anrufe. "
                }
            }

            var JsJodaNow = JSJoda.LocalDateTime.now();
            var currentTime = "Es ist "+JsJodaNow.hour() +" Uhr "+ JsJodaNow.minute();
            var minutes

            if (itemAtHome.state != ON) //gone
            {
                minutes = (JSJoda.convert(jodaDate(JsJodaNow)).toEpochMilli() - JSJoda.convert(jodaDate(itemAtHomeBegin.state)).toEpochMilli()) /1000 / 60; //= jodaDate(itemAtHomeBegin.state).compareTo(JsJodaNow) / 1000 / 60;
                var hours = round(minutes/60,2);
                logInfo(id + " is away, has been home for " + hours + " h");

                postUpdate(itemAtHomeEnd, JsJodaNow + "Z" );
                var execResult = executeCommandLineAndWaitResponse("/etc/openhab2/scripts/sh/calpost.sh XXXXXXX@group.calendar.google.com post \""+id+" zu Hause ("+hours+" h)\" "+ jodaDate(itemAtHomeBegin.state).minusHours(2) +"Z"+" "+ JsJodaNow.minusHours(2) + "Z", 120*1000);
                //logInfo("PostCalEvents", execResult);
            }
            else //home
            {
                minutes = (JSJoda.convert(jodaDate(JsJodaNow)).toEpochMilli() - JSJoda.convert(jodaDate(itemAtHomeEnd.state)).toEpochMilli()) / 1000 / 60;//jodaDate(itemAtHomeEnd.state).compareTo(JsJodaNow) / 1000 / 60;
                var hours = round(minutes/60,2);
                logInfo(id + " is home, has been away for "+ hours +" h")

                postUpdate(itemAtHomeBegin, JsJodaNow + "Z" );
                if (minutes > 10) 
                {
                    var timeout = hours +" Stunden"
                    var  out = "Willkommen Daheim "+name+", du warst " + timeout.replace(".", ",") + " lang weg. " + MissedCalls + currentTime
                    sendCommand(itemTTSOut2,out)
                }
            }
        }
    }
});

JSRule({
    name: "SpeedtestRerun",
    description: "Line: "+__LINE__,
    triggers: [
        ItemCommandTrigger("SpeedtestRerun")
    ],
    execute: function( module, input)
    {
        //logInfo(input.command);

        if(input.command == "ON")
        {
            logInfo("speedtest executed");

            var itemSpeedtestRerun = getItem("SpeedtestRerun");
            var itemTTSOut2 = getItem("TTSOut2");
            var itemSpeedtestSummary = getItem("SpeedtestSummary");
            
            postUpdate(itemSpeedtestRerun,"Messung läuft");
            sendCommand(itemTTSOut2,"Messung läuft.");
    
            var speedtestCliOutput = executeCommandLineAndWaitResponse("/usr/local/bin/speedtest-cli@@--simple", 1000 * 120);
    
            if (speedtestCliOutput.startsWith("Ping") && speedtestCliOutput.endsWith("Mbit/s")) 
            {
                var results = speedtestCliOutput.split("\n");
                logInfo(results);
    
                var ping = parseFloat(results[0].split(" ")[1]);
                var down = parseFloat(results[1].split(" ")[1]);
                var up   = parseFloat(results[2].split(" ")[1]);
    
                var strdown = round(down,1).toString().replace('.', ',');
                var strup = round(up,1).toString().replace('.', ',');
                var strping = round(ping,0).toString().replace('.', ',');
                
                postUpdate(itemSpeedtestSummary,"▼  "+strdown+" Mbit/s  ▲ "+strup+" Mbit/s ("+strping+" ms)");
                logInfo("speedtest finished.");
                sendCommand(itemTTSOut2,"Speedtest Ergebnis ist "+strdown+" Megabit Downstream, und "+strup+" Megabit Upstream, mit "+strping+" Millisekunden Ping");
            } 
            else
            {
                postUpdate(itemSpeedtestSummary,"(unbekannt)");
                logError("speedtest failed. Output:\n" + speedtestCliOutput + "\n\n");
                sendCommand(itemTTSOut2,"Fehler bei der Ausführung von Speedtest");
            }
    
            var currentTime = formatUITimeStampfromJodaDate(DateTime.now());
            postUpdate(itemSpeedtestRerun,"last run: " + currentTime);
        }
    }
});