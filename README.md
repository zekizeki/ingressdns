# ingress dns

This code looks for ingress controllers and then adds an entry to a consul server so that the ingress point has a DNS entry.

Define a replication controller for ingress DNS

```
apiVersion: v1
kind: ReplicationController
metadata:
  name: ingressdns
spec:
  replicas: 1
  selector:
    name: ingressdns
  template:
    metadata:
      labels:
        name: ingressdns
    spec:
      containers:
      - name: ingressdns
        image: zekizeki/ingressdns:0.0.1
        env:
          - name: KUBE_API_URL
            value: "http://192.168.99.100:8080/r/projects/1a8/kubernetes/api"
          - name: KUBE_API_USER
            value: yourusername
          - name: KUBE_API_PASSWORD
            value: yourpassword
          - name: DOMAIN
            value: service.consul
          - name: CONSUL_API_ADDRESS
            value: "http://127.0.0.1:8500/v1/agent/service/register"
```

# Create the ingressdns rc

```
kubectl create -f ingressdns.yaml
```


# Using Consul for service discovery
To publish service addresses to consul ensure that the following environment variables are set on the vulcaningress container

```
- name: POD_NAME
  valueFrom:
    fieldRef:
      fieldPath: metadata.name
- name: DOMAIN
  value: service.consul
- name: ENVIRONMENT_NAME
  value: tooling
- name: CONSUL_API_ADDRESS
  value: http://consulhost:8500/v1/agent/service/register
- name: CONSUL_API_TOKEN
  value: xxxxxxxxxxxxxxxxx

```

The host name used in an ingress must be made up of 4 portions and end in service.consul (unless consul has been configured to use a different domain label)

e.g.    myservice.myenv.service.consul


