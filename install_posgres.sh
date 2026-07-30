#!/bin/bash

# 1. Adiciona a chave oficial de segurança do repositório do PostgreSQL
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://postgresql.org | sudo gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg

# 2. Adiciona o repositório oficial do PostgreSQL na sua lista de fontes
echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://postgresql.org $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list

# 3. Atualiza a lista de pacotes e instala o PostgreSQL 16 junto com seus utilitários
sudo apt update && sudo apt install -y postgresql-16 postgresql-contrib-16
