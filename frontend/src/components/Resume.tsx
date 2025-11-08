export default function Resume() {
  return (
    <div className="resume-background">
      <div className="resume-content">
        <header className="resume-header">
          <h1>Christian Moore</h1>
          <h2>Cloud Solutions Architect</h2>
          <div className="contact-info">
            <a href="mailto:christian@christianmoore.me">christian@christianmoore.me</a>
            <span>•</span>
            <a href="https://christianmoore.me" target="_blank" rel="noopener noreferrer">christianmoore.me</a>
            <span>•</span>
            <a href="https://www.linkedin.com/in/christian-moore-7672861ab" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <span>•</span>
            <span>New Hampshire</span>
          </div>
        </header>

        <section className="resume-section">
          <h3>PROFESSIONAL SUMMARY</h3>
          <p>
            Cloud Solutions Architect with 15+ years operating and 10+ years designing
            production platforms across cloud and on‑prem. Deep expertise in AWS, Kubernetes/GitOps,
            IaC, security hardening, observability, and networking. Specialized in HPC for EDA,
            platform engineering, and production SRE.
          </p>
        </section>

        <section className="resume-section">
          <h3>CORE COMPETENCIES</h3>
          <p>
            Platform Architecture • DevSecOps • Container Orchestration • Infrastructure as Code •
            Cost Optimization • Disaster Recovery • High Availability • Performance Tuning
          </p>
        </section>

        <section className="resume-section">
          <h3>TECHNICAL SKILLS</h3>
          <div className="skills-grid">
            <div>
              <strong>Container Orchestration & GitOps:</strong> Kubernetes (k8s, EKS), ECS, ArgoCD, Docker
            </div>
            <div>
              <strong>Infrastructure as Code:</strong> Terraform, Ansible, AWS CDK, CloudFormation, Helm
            </div>
            <div>
              <strong>Observability & Monitoring:</strong> Prometheus, Grafana, CloudWatch, ELK Stack
            </div>
            <div>
              <strong>Security & Compliance:</strong> Zero‑trust, secrets mgmt, container security, IAM, KMS, vuln scanning
            </div>
            <div>
              <strong>CI/CD & Automation:</strong> GitHub Actions, GitLab CI/CD, Jenkins, Bitbucket Pipelines, pre‑commit hooks
            </div>
            <div>
              <strong>Languages & Scripting:</strong> Python, Bash, JavaScript/TypeScript, YAML, SQL, TOML, PowerShell
            </div>
            <div>
              <strong>Storage & Data:</strong> AWS EBS, FSx (OpenZFS), EFS, NFS, S3, snapshots & backup
            </div>
            <div>
              <strong>Networking:</strong> ALB/NLB, Traefik, NGINX, DNS, TLS/SSL, VPC, PrivateLink, Route 53
            </div>
            <div>
              <strong>Databases:</strong> PostgreSQL, MySQL, Redis, DynamoDB
            </div>
            <div>
              <strong>Dev Tools:</strong> Git (GitHub/GitLab/Bitbucket)
            </div>
            <div>
              <strong>HPC & EDA Admin:</strong> Slurm, Synopsys
            </div>
            <div>
              <strong>Operating Systems:</strong> Linux (RHEL/Fedora/CentOS, Ubuntu/Debian, Amazon Linux), macOS, Windows Server
            </div>
          </div>
        </section>

        <section className="resume-section">
          <h3>PROFESSIONAL EXPERIENCE</h3>

          <div className="job">
            <div className="job-header">
              <strong>Cloud Solutions Architect</strong>
              <span>Amazon (Ring/Blink)</span>
            </div>
            <div className="job-meta">
              <span>Remote (NH)</span>
              <span>February 2021 - Present</span>
            </div>
            <ul>
              <li>Architected & operated large‑scale Slurm‑based HPC for silicon design</li>
              <li>Created hybrid cloud imaging and release management tools in Python for Raspberry Pi</li>
              <li>Implemented AWS FSx for OpenZFS with custom retention/lifecycle/snapshot/backup strategies</li>
              <li>Established GitOps/IaC (AWS CDK, GitLab CI/CD) and automated pipelines for staged releases</li>
              <li>Implemented observability (OpenSearch/Grafana) and custom performance tooling for efficiency gains</li>
            </ul>
          </div>

          <div className="job">
            <div className="job-header">
              <strong>Cloud Security Engineer</strong>
              <span>Cimpress</span>
            </div>
            <div className="job-meta">
              <span>Waltham, MA</span>
              <span>July 2017 - March 2020</span>
            </div>
            <ul>
              <li>Built Node.js/Lambda security reporting tool for compliance monitoring across 200+ AWS accounts</li>
              <li>Implemented zero‑trust patterns (PrivateLink, Transit Gateway) to reduce attack surface</li>
              <li>Created multi-platform IAM credential generation tool in Golang with adjustable permission tiers</li>
              <li>Provided company‑wide AWS security training and best‑practice documentation</li>
            </ul>
          </div>

          <div className="job">
            <div className="job-header">
              <strong>DevOps Engineer</strong>
              <span>Cimpress</span>
            </div>
            <div className="job-meta">
              <span>Waltham, MA</span>
              <span>October 2014 - June 2017</span>
            </div>
            <ul>
              <li>Facilitated migration from monolithic on-prem Windows .NET to AWS Linux microservices</li>
              <li>Delivered CI/CD with Jenkins & Bitbucket enabling rapid daily deployments</li>
              <li>Introduced Terraform/Vagrant IaC with local/dev/test/prod staged releases</li>
              <li>Operated multi‑node Elasticsearch for large‑scale log ingestion & diagnostics</li>
              <li>Automated provisioning/monitoring and championed DevOps best practices</li>
            </ul>
          </div>

          <div className="job">
            <div className="job-header">
              <strong>Problem Manager</strong>
              <span>Vistaprint</span>
            </div>
            <div className="job-meta">
              <span>Lexington, MA</span>
              <span>January 2010 - September 2013</span>
            </div>
            <ul>
              <li>Ran major incident, problem, and change processes for a high‑traffic e‑commerce platform</li>
              <li>Analyzed production impact and costs via advanced SQL and real‑time data analysis</li>
              <li>Implemented JIRA workflows and authored runbooks to standardize operations</li>
              <li>Coordinated cross‑functional incident bridges to minimize business impact</li>
              <li>Presented executive summaries to business leaders and conducted incident postmoterms</li>
            </ul>
          </div>

          <div className="job">
            <div className="job-header">
              <strong>Systems Administrator</strong>
              <span>Vistaprint</span>
            </div>
            <div className="job-meta">
              <span>Lexington, MA</span>
              <span>June 2007 - December 2009</span>
            </div>
            <ul>
              <li>Administered Windows production servers for large e‑commerce site</li>
              <li>Managed enterprise Active Directory and performed release procedures</li>
              <li>Integrated Nagios/Microsoft Operations Manager monitoring to catch issues early</li>
              <li>Created custom tooling for change management and anomaly detection</li>
            </ul>
          </div>
        </section>

        <section className="resume-section">
          <h3>PERSONAL PROJECTS</h3>

          <div className="project">
            <p>
              <strong>Kubernetes Homelab:</strong> Production‑grade k3s with ArgoCD GitOps, sealed secrets, default‑deny NetworkPolicies,
              cert‑manager TLS, Longhorn backups, and full Prometheus/Grafana/Loki/Alertmanager observability;
              automated OS/cluster updates and Helm‑managed apps. <a href="https://github.com/cmoore1776/homelab" target="_blank" rel="noopener noreferrer">Source</a>
            </p>
          </div>

          <div className="project">
            <p>
              <strong>Real-time AI Avatar:</strong> Golang backend, WebSocket streaming, realtime voice synthesis,
              and a React frontend. <a href="https://resume.k3s.christianmoore.me" target="_blank" rel="noopener noreferrer">Live</a> • <a href="https://github.com/cmoore1776/resume" target="_blank" rel="noopener noreferrer">Source</a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
