var Repeat = require('repeat');
var request = require('request');
var etcdnodejs = require('nodejs-etcd');

// the kubernetes api cert in rancher is selfsigned and auto generated so we just have to ignore that when connecting to the kubernetes API
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

var SVC_POLL_INTERVAL = process.env.SVC_POLL_INTERVAL || 15;
var KUBERNETES_SERVICE_PORT = process.env.KUBERNETES_SERVICE_PORT || '8080';
var KUBERNETES_SERVICE_HOST = process.env.KUBERNETES_SERVICE_HOST || 'localhost';
var PROTOCOL = 'https';
var KUBE_API_URL = process.env.KUBE_API_URL || 'https://'+KUBERNETES_SERVICE_HOST+':'+KUBERNETES_SERVICE_PORT;
var KUBE_API = KUBE_API_URL +'/apis/extensions/v1beta1/ingresses';
var KUBE_API_USER = process.env.KUBE_API_USER || '';
var KUBE_API_PASSWORD = process.env.KUBE_API_PASSWORD || '';
var CONSUL_API_ADDRESS = process.env.CONSUL_API_ADDRESS || 'http://localhost:8500';
var CONSUL_API_TOKEN = process.env.CONSUL_API_TOKEN;
var DOMAIN =  process.env.DOMAIN || 'service.consul';
var HOST_REGEX = process.env.HOST_REGEX;

// call the kubernetes API and get the list of ingresses tagged
function checkIngressList() {
  console.log("requesting ingress list from " + KUBE_API);
  
  var authObj = {user:KUBE_API_USER,pass:KUBE_API_PASSWORD};
  
  // call kubernetes API
  request({uri:KUBE_API,auth:authObj}, function (error, response, body) {
    
    if (!error && response.statusCode == 200) {
      var ingresses = parseJSON(JSON.parse(body));
      
      console.log(ingresses);
      
      // add service into etcd backend for vulcand
      for(var i = 0; i < ingresses.length;i++) {
      
        publishServiceToConsul(ingresses[i]);
  
      }
     
    } else {
        console.log('status code'+response.statusCode +'error calling kubernetes API '+error)
    }
  
  })
  
  
  
};

/*
"kind": "IngressList",
"apiVersion": "extensions/v1beta1",
"metadata": {
  "selfLink": "/apis/extensions/v1beta1/ingresses",
  "resourceVersion": "577"
},
"items": [
  {
    "metadata": {
      "name": "path-based-ingress",
      "namespace": "default",
      "selfLink": "/apis/extensions/v1beta1/namespaces/default/ingresses/path-based-ingress",
      "uid": "fedff6cf-4811-11e6-af16-0246b1ceb6a3",
      "resourceVersion": "331",
      "generation": 1,
      "creationTimestamp": "2016-07-12T09:21:20Z"
    },
    "spec": {
      "rules": [
        {
          "host": "foo.bar.com",
          "http": {
            "paths": [
              {
                "path": "/foo",
                "backend": {
                  "serviceName": "nginx-service",
                  "servicePort": 90
                }
              },
              {
                "path": "/bar",
                "backend": {
                  "serviceName": "nginx-service",
                  "servicePort": 90
                }
              }
            ]
          }
        }
      ]
    },
    "status": {
      "loadBalancer": {
        "ingress": [
          {
            "ip": "9.45.207.136"
          }
        ]
      }
    }
  }
]
}
*/

// Parse the JSON returned from the kubernetes API and extract the information we need.
function parseJSON(ingressList) {
  
  var ingressArray= [];
  
  for(var i =0; i < ingressList.items.length;i++) {
    
    if(!ingressList.items[i].status.loadBalancer){
      console.log('no load balancer assigned to ingress '+ ingressList.items[i].metadata.name + ' skipping');
      continue;
    }
    
    // process all rules in each ingress looking for hosts to register DNS entries for
    for(var j=0;j < ingressList.items[i].spec.rules.length;j++) {
      
      if(ingressList.items[i].spec.rules[j].host && ingressList.items[i].status.loadBalancer.ingress){
        
        var ingress = {
          name: ingressList.items[i].metadata.name,
          namespace: ingressList.items[i].metadata.namespace,
          host: ingressList.items[i].spec.rules[j].host,
          ip: ingressList.items[i].status.loadBalancer.ingress[0].ip
        }
        
      }
      
      ingressArray.push(ingress);
    }
    
    
    
  }
  
  return ingressArray;
  
}

// If a consul API address is specified then publish service routes 
// so that they can be DNS resolved
function publishServiceToConsul(service){
  
  
  if(typeof(CONSUL_API_ADDRESS)!== 'undefined') {
   
   
    // check host name is valid for consul registration
    var labels = service.host.split(".");
    
    if(!service.host.endsWith(DOMAIN)){
      console.log('Ingress host names must end with '+DOMAIN);
      return;
    }
    
    if(labels.length != 4) {
      console.log("hostnames must be made up of 4 labels e.g. label1.label2."+DOMAIN);
      return;
    }
    
    // Use additional user provided regex to validate host if present
    if(typeof(HOST_REGEX)!== 'undefined') {
      var regex = new RegExp(HOST_REGEX);
      if (!regex.test(service.host)) {
        console.log("Hostname does not match the validation expresssion "+HOST_REGEX);
        return;
      } 
    }
  
    var consulSvc = {
                  id: service.host,
                  name: labels[1], 
                  tags: [labels[0]],
                  address:service.ip
                };
                
    var bodyStr=JSON.stringify(consulSvc);
    var requestOpts = {url:CONSUL_API_ADDRESS,body:bodyStr};
    
    if(typeof(CONSUL_API_TOKEN)!== 'undefined') {
      
      requestOpts.headers = { 'X-Consul-Token': CONSUL_API_TOKEN }
    } 
    
    // call consul API
    request.put(requestOpts, function (error, response, body) {
      console.log("Publish service to consul"); 
      
      if (!error && response.statusCode == 200) {
        
        console.log(service.host+' registered in consul and directing to ' + service.ip);
        
      } else {
          console.log('error adding '+service.host+' to consul: '+error);
      }
    
    })
  }
}

// Poll the kubernetes API for new ingresses 
// TODO we should be able to make this event based.
Repeat(checkIngressList).every(SVC_POLL_INTERVAL, 'sec').start.in(2, 'sec');

