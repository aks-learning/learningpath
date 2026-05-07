---
sidebar_position: 4
title: "Pod Security"
description: "Enforce pod security admission policies and standards to prevent privileged and insecure pod configurations."
---

# Pod Security

<span className="badge--intermediate">📚 Intermediate</span>

Explore pod security admission (PSA) and standards for enforcing security constraints on pod definitions. Implement best practices to prevent privileged escalation and enforce secure container configurations.

## Key Concepts

- **Pod Security Admission**: Kubernetes built-in pod security enforcement
- **Security Standards**: Privileged, baseline, and restricted profiles
- **Admission Modes**: Enforce, audit, and warn modes
- **Capabilities**: Linux container capabilities control
- **Volumes**: Restrict host path and host namespace access
- **User Context**: Enforce non-root and read-only file systems
- **Security Context**: Container and pod-level security settings

## Resources

- 📄 [Pod Security Admission in AKS](https://learn.microsoft.com/en-us/azure/aks/use-psa)
- 🧪 [Azure Linux OS Guard Lab](https://azure-samples.github.io/aks-labs/docs/security/azure-linux-os-guard)

## 🧪 Hands-on Lab

> **[Azure Linux OS Guard - Security Hardening](https://azure-samples.github.io/aks-labs/docs/security/azure-linux-os-guard)**
> Secure your Linux VMs running on Azure with automated hardening controls.
> ⏱️ ~45 minutes | 📚 Intermediate

## Next Steps

- Enable Pod Security Admission on namespaces
- Audit current pod configurations
- Implement baseline and restricted standards
