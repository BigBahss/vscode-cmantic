#ifndef BASE_H
#define BASE_H

#include<string>


class Base
{
public:
    explicit Base();
    explicit Base(const std::string &name);
    ~Base();

    std::string name() const noexcept;
    void setName(const std::string &name);

    int amount() const noexcept;
    void setAmount(int amount);

    int instances() const noexcept;

private:
    std::string m_name;
    int m_amount;

    static int m_instances;
};

#endif // BASE_H
